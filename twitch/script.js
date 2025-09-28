const CLIENT_ID = "guce7ah6jn45kgnvpanp135dalci1d";
let logger = new Logger();
let commandHandler = new CommandHandler();
let auth = new Auth(
{
	clientId: CLIENT_ID,
	redirectUri: "https://copiumbot.github.io/twitch",
	permissions: `channel:bot channel:read:subscriptions channel:moderate ` +
		`moderation:read moderator:manage:announcements moderator:read:banned_users ` +
		`moderator:manage:banned_users moderator:read:chat_messages moderator:manage:chat_messages ` +
		`moderator:read:chat_settings moderator:manage:chat_settings moderator:read:chatters ` +
		`moderator:read:followers moderator:read:moderators user:bot user:read:chat user:read:whispers ` +
		`user:manage:whispers user:write:chat channel:manage:broadcast`,
	platform: "twitch",
	logger
});
let client = new CopeTwitch({ logger });
let config =
{
	voice: localStorage.getItem("twitch_voice") ?? null,
	volume: localStorage.getItem("twitch_volume") ?? 0.5,
	blockedTerms: localStorage.getItem("twitch_blockedTerms") !== null ?
		JSON.parse(localStorage.getItem("twitch_blockedTerms")) : [],
	notifications:
	{
		follow: localStorage.getItem("twitch_followNotifications") === "true" ? true : false
	}
}

commandHandler
.On(/^\!resetTTS/, true, (channel, username, tags, message, originalMessage) =>
{
	synth.cancel();
	AddChatNotification(`${username} reset the TTS.`);
})
.On(/^\!mute\s/, true, (channel, username, tags, message, originalMessage) =>
{
	userSettings.set(message,
	{
		muted: true,
		voice: userSettings.has(message) ? userSettings.get(message).voice : "default"
	});

	const arrayUserSettings = Array.from(userSettings);
	localStorage.setItem("twitch_userSettings", JSON.stringify(arrayUserSettings));
	AddChatNotification(`${username} muted ${message}.`);
})
.On(/^\!unmute\s/, true, (channel, username, tags, message, originalMessage) =>
{
	if(!userSettings.has(message))
		return;

	if(userSettings.get(message).voice === "default")
		userSettings.delete(message);
	else
		userSettings.set(message,
		{
			muted: false,
			voice: userSettings.get(message).voice
		});

	const arrayUserSettings = Array.from(userSettings);
	localStorage.setItem("twitch_userSettings", JSON.stringify(arrayUserSettings));
	AddChatNotification(`${username} unmuted ${message}.`);
})
.On(/^\!tags\s/, true, (channel, username, tags, message, originalMessage) =>
{
	const streamTags = message.split(", ");
	client.UpdateChannelData({"tags": streamTags});
	client.Say(`${username} set the stream tags to: ${message}.`);
})
.On(/^\!title\s/, true, (channel, username, tags, message, originalMessage) =>
{
	client.UpdateChannelData({"title": message});
	client.Say(`${username} set the stream title to: ${message}.`);
})
.On(/^\!category\s/, true, async (channel, username, tags, message, originalMessage) =>
{
	const category = await client.GetCategory(message);
	if(category.length === 0)
		return;

	client.UpdateChannelData({"game_id": category[0].id});
	client.Say(`${username} set the stream category to: ${category[0].name}.`);
})
.On(/^\!permissions/, true, (channel, username, tags, message, originalMessage) =>
{
	client.Say(client.GetPermissions().join(", "));
	AddChatNotification(`${username} requested permission list.`);
})
.On(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
	false, (channel, username, tags, message, originalMessage) =>
{
	AddToQueue(null, `${tags.displayName} sent a link`);
	AddChatMessage(tags.color, username, tags.chatter_user_login, originalMessage, tags.badges);
})
.OnArray(config.blockedTerms, false, (channel, username, tags, message, originalMessage) =>
{
	if(IsMod(tags.badges) === false)
	{
		AddChatNotification(`${username} used a blacklisted term.`);
		client.Ban(tags.chatter_user_id, 600, "Bot");
	}
	AddChatMessage(tags.color, username, tags.chatter_user_login, originalMessage, tags.badges);
})
.Unhandled((channel, username, tags, message) =>
{
	AddChatMessage(tags.color, username, tags.chatter_user_login, message, tags.badges);
	AddToQueue(tags.chatter_user_login, message);
});

auth.On("token_received", (event, data) =>
{
	if(event === "authorized" && data.state != sessionStorage.getItem("code_verifier"))
		return;

	const expires_in = data.expires_in ?? 0;
	const now = Date.now();
	const token = data.access_token ?? null;
	const tokenExpire = now + expires_in * 1000;
	const permissions = data.scope ?? [];

	localStorage.setItem("twitch_refreshToken", data.refresh_token ?? null);
	localStorage.setItem("twitch_token", token);
	localStorage.setItem("twitch_permissions", JSON.stringify(permissions));

	if(event === "authorized")
	{
		localStorage.setItem("twitch_tokenExpire", tokenExpire);
		localStorage.setItem("twitch_tokenExpireInSeconds", expires_in);
		window.location.href = "https://copiumbot.github.io/twitch/";
		return;
	}
		
	client.SetParams(
	{
		token,
		tokenExpire,
		permissions
	});

	if(event === "refreshed")
		auth.ValidateToken(token, data.refresh_token);
});

auth.On("token_validated", (data) =>
{
	const expires_in = data.expires_in ?? 0;
	const now = Date.now();
	const tokenExpire = now + expires_in * 1000;
	const permissions = data.scopes ?? [];

	localStorage.setItem("twitch_tokenExpire", tokenExpire);
	localStorage.setItem("twitch_permissions", JSON.stringify(permissions));
	localStorage.setItem("twitch_tokenExpireInSeconds", expires_in);

	client.SetParams(
	{
		token: localStorage.getItem("twitch_token"),
		clientId: CLIENT_ID,
		permissions,
		tokenExpire,
		userId: data.user_id
	});

	client.Connect();
});

client.On("request_token_refresh", async () =>
{
	await auth.RefreshToken(localStorage.getItem("twitch_refreshToken"));
});

client.On("connecting", () =>
{
	SetConnectionStatus("Connecting");
});

client.On("connected", async () =>
{
	SetConnectionStatus("Connected");
	logger.Info(`Successfully connected`);

	const followers = await client.GetFollowers();
	followers.forEach((item, index) =>
	{
		AddFollower(item.user_name, item.followed_at);
	});
});

client.On("disconnected", () =>
{
	SetConnectionStatus("Not Connected");
	logger.Info(`Disconnected`);
});

client.On("message", (channel, username, tags, message) =>
{
	commandHandler.HandleMessage(channel, username, tags, message);
});

client.On("follow", async (displayName, username, id, time) =>
{
	if(config.notifications.follow)
		client.Say(`Thank you for following ${displayName}`);

	const followers = await client.GetFollowers();
	followers.forEach((item, index) =>
	{
		AddFollower(item.user_name, item.followed_at);
	});
});

document.addEventListener("DOMContentLoaded", async () =>
{
	await auth.GetAuthorizationParams();

	if(localStorage.getItem("twitch_token"))
		await auth.ValidateToken(localStorage.getItem("twitch_token"),
			localStorage.getItem("twitch_refreshToken"));
});

document.getElementById("authorize").addEventListener("click", () =>
{
	auth.Authorize();
});

document.getElementById("ttsButton").addEventListener("click", () =>
{
	const savedVoice = localStorage.getItem("twitch_voice") ?? voices[0].name;
	const savedVolume = localStorage.getItem("twitch_volume") ?? 0.5;

	let voiceListHTML = "";
	voices.forEach((item, index) =>
    {
		const isSelected = item.name === savedVoice ? "selected" : "";
        voiceListHTML += `
            <option value="${item.name}" style="color: var(--fontColor);" ${isSelected}>
                ${item.name} (${item.lang})</option>
        `;
    });

	DisplayModal("Text To Speech", `
		<label class="form-label m-0 pe-2 mb-2" for="modalVoiceSelect">Voice</label>
		<select class="form-select mb-3" id="modalVoiceSelect" style="background-color: var(--bgColor);
			border-color: var(--primaryColor); cursor: pointer; color: var(--fontColor);">
			${voiceListHTML}
		</select>
		<div>
			<label for="volumeSlider" class="form-label mb-0">Volume: <span id="volumeValue">
				${savedVolume * 100}</span>%</label>
			<input type="range" class="form-range" min="0" max="100" id="volumeSlider" value="${savedVolume * 100}">
		</div>
	`);
	document.getElementById("volumeSlider").style.setProperty("--range-fill", `${savedVolume * 100}%`);

	document.getElementById("modalVoiceSelect").addEventListener("change", (e) =>
	{
		config.voice = e.currentTarget.value;
		localStorage.setItem("twitch_voice", config.voice);
	});

	document.getElementById("volumeSlider").addEventListener("input", (e) =>
	{
		document.getElementById("volumeValue").innerText = e.currentTarget.value;
	});
	document.getElementById("volumeSlider").addEventListener("change", (e) =>
	{
		config.volume = e.currentTarget.value / 100;
		localStorage.setItem("twitch_volume", config.volume);
	});
});

document.getElementById("moderationButton").addEventListener("click", () =>
{
	const savedBlockedTerms = localStorage.getItem("twitch_blockedTerms") !== null ?
		JSON.parse(localStorage.getItem("twitch_blockedTerms")).join("\n") : "";

	DisplayModal("Moderation", `
		<label for="volumeSlider" class="form-label">Blocked Terms</label>
		<textarea class="form-control" id="blockedTerms" style="background-color: var(--bgColor);
			border-color: var(--primaryColor); color: var(--fontColor); height: 10vh;">${savedBlockedTerms}</textarea>
	`);

	document.getElementById("blockedTerms").addEventListener("change", (e) =>
	{
		config.blockedTerms = e.currentTarget.value != "" ? e.currentTarget.value.split("\n") : [];
		localStorage.setItem("twitch_blockedTerms", JSON.stringify(config.blockedTerms));
	});
});

document.getElementById("notificationsButton").addEventListener("click", () =>
{
	const savedFollowNotifications = localStorage.getItem("twitch_followNotifications") == "true" ?
		true : false;

	DisplayModal("Notifications", `
		<div class="w-100 d-flex justify-content-between align-items-center">
			<label class="form-label m-0 pe-2" for="followNotifications">New Follow</label>
			
			<div class="form-check form-switch">
				<input class="form-check-input" type="checkbox" role="switch" id="followNotifications">
			</div>
		</div>	
	`);
	document.getElementById("followNotifications").checked = savedFollowNotifications;

	document.getElementById("followNotifications").addEventListener("change", (e) =>
	{
		config.notifications.follow = e.currentTarget.checked;
		localStorage.setItem("twitch_followNotifications", config.notifications.follow);
	});
});

const AddToQueue = (username, message) =>
{
	if(userSettings.get(username)?.muted === true)
		return;

    let utterance = new SpeechSynthesisUtterance(message);
    utterance.volume = config.volume;
	const currentVoice = userSettings.has(username) ? userSettings.get(username).voice : config.voice;
    utterance.voice = voices.find(voice => voice.name === currentVoice);
    synth.speak(utterance);
}

window.addEventListener("beforeunload", () =>
{
	client.Disconnect();
});
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
let client = new CopeTwitch(
{
	clientId: CLIENT_ID,
	logger
});
let config =
{
	ttsEnabled: localStorage.getItem("twitch_ttsEnabled") === "true" ? true : false,
	voice: localStorage.getItem("twitch_voice") ?? null,
	volume: localStorage.getItem("twitch_volume") ?? 0.5,
	blockedTerms: localStorage.getItem("twitch_blockedTerms") !== null ?
		JSON.parse(localStorage.getItem("twitch_blockedTerms")) : [],
	notifications:
	{
		follow: localStorage.getItem("twitch_followNotifications") === "true" ? true : false,
		raid: localStorage.getItem("twitch_raidNotifications") === "true" ? true : false
	},
	chattersInterval: null
}

auth.On("authorize", (data) =>
{
	if(data.state != sessionStorage.getItem("code_verifier"))
		return;

	UpdateSessionData(
	{
		token: data?.access_token ?? null,
		refreshToken: data?.refresh_token ?? null,
		expiresIn: data?.expires_in ?? 0,
		permissions: data?.scope ?? []
	});

	window.location.href = auth.redirectUri;
});

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
	AddToQueue(tags.chatter_user_login, `${username} sent a link`);
	AddChatMessage(tags.color, username, tags.chatter_user_login, originalMessage, tags.badges);
})
.OnArray(config.blockedTerms, false, (channel, username, tags, message, originalMessage) =>
{
	if(commandHandler.IsMod(tags.badges) === false)
	{
		AddChatNotification(`${username} used a blacklisted term.`);
		client.Ban(tags.chatter_user_id, 600, "Use of a blacklisted term.");
	}
	AddChatMessage(tags.color, username, tags.chatter_user_login, originalMessage, tags.badges);
})
.Unhandled((channel, username, tags, message) =>
{
	AddChatMessage(tags.color, username, tags.chatter_user_login, message, tags.badges);
	AddToQueue(tags.chatter_user_login, message);
});

client.On("request_token_refresh", async () =>
{
	const refreshToken = localStorage.getItem("twitch_refreshToken");
	if(refreshToken === null)
		return;

	const refreshedData = await auth.RefreshToken(refreshToken);
	if(refreshedData === null)
		return;

	if(refreshedData?.access_token === null || refreshedData?.access_token === undefined)
		return;

	const validatedData = await auth.ValidateToken(refreshedData.access_token);
	if(validatedData === null || validatedData === false)
		return;

	UpdateSessionData(
	{
		token: refreshedData.access_token,
		refreshToken: refreshedData?.refresh_token ?? null,
		expiresIn: validatedData?.expires_in ?? 0,
		permissions: validatedData?.scopes ?? [],
		userId: validatedData?.user_id ?? null
	});

	if(client.IsConnected() === false)
		client.Connect();

	logger.Info("Refresh token request completed successfully");
});

client.On("connecting", () =>
{
	SetConnectionStatus("Connecting");
});

client.On("connected", async () =>
{
	SetConnectionStatus("Connected");
	logger.Info(`Successfully connected`);

	document.getElementById("followers").innerHTML = "";
	const followers = await client.GetFollowers();
	for(let i = followers.length - 1; i >= 0; --i)
		AddFollower(followers[i].user_name, followers[i].followed_at);

	DisplayChatters();
	if(config.chattersInterval === null)
		config.chattersInterval = setInterval(DisplayChatters, 60000);
});

client.On("disconnected", () =>
{
	SetConnectionStatus("Not Connected");
	logger.Info(`Disconnected`);
	clearInterval(config.chattersInterval);
	config.chattersInterval = null;
});

client.On("message", (channel, username, tags, message) =>
{
	commandHandler.HandleMessage(channel, username, tags, message);
});

client.On("follow", async (displayName, username, id, time) =>
{
	if(config.notifications.follow)
		client.Say(`Thank you for following ${displayName}`);

	document.getElementById("followers").innerHTML = "";
	const followers = await client.GetFollowers();
	for(let i = followers.length - 1; i >= 0; --i)
		AddFollower(followers[i].user_name, followers[i].followed_at);
});

client.On("raid", (displayName, username, id, viewers) =>
{
	if(config.notifications.raid === false)
		return;

	const label = `${displayName} raided you with ${viewers} viewer${viewers !== 1 ? "s" : ""}.`
	AddChatNotification(label);
	AddToQueue(null, label);
});

document.addEventListener("DOMContentLoaded", async () =>
{
	await auth.GetAuthorizationParams();
	
	const token = localStorage.getItem("twitch_token");
	if(token === null)
		return;

	const validatedData = await auth.ValidateToken(token);
	if(validatedData === null)
		return;

	if(validatedData === false)
	{
		client._Emit("request_token_refresh");
		return;
	}

	UpdateSessionData(
	{
		token,
		expiresIn: validatedData?.expires_in ?? 0,
		permissions: validatedData?.scopes ?? [],
		userId: validatedData?.user_id ?? null
	});

	client.Connect();
});

document.getElementById("authorize").addEventListener("click", () =>
{
	auth.Authorize();
});

document.getElementById("ttsButton").addEventListener("click", () =>
{
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
		<div class="w-100 d-flex justify-content-between align-items-center mb-2">
			<label class="form-label m-0 pe-2" for="enableTTS">Enable</label>
			
			<div class="form-check form-switch">
				<input class="form-check-input" type="checkbox" role="switch" id="enableTTS">
			</div>
		</div>	
		<label class="form-label m-0 pe-2 mb-2" for="modalVoiceSelect">Voice</label>
		<select class="form-select mb-3" id="modalVoiceSelect" style="background-color: var(--bgColor);
			border-color: var(--primaryColor); cursor: pointer; color: var(--fontColor);">
			${voiceListHTML}
		</select>
		<div class="mb-2">
			<label for="volumeSlider" class="form-label mb-0">Volume: <span id="volumeValue">
				${config.volume * 100}</span>%</label>
			<input type="range" class="form-range" min="0" max="100" id="volumeSlider" value="${config.volume * 100}">
		</div>
		<button class="btn" id="skipButton" style="background-color: var(--primaryColor); float: right;"
			>Skip Messages</button>
	`);
	document.getElementById("enableTTS").checked = config.ttsEnabled;
	document.getElementById("volumeSlider").style.setProperty("--range-fill", `${config.volume * 100}%`);

	document.getElementById("enableTTS").addEventListener("change", (e) =>
	{
		config.ttsEnabled = e.currentTarget.checked;
		localStorage.setItem("twitch_ttsEnabled", config.ttsEnabled);
	});

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

	document.getElementById("skipButton").addEventListener("click", () =>
	{
		synth.cancel();
	});
});

document.getElementById("moderationButton").addEventListener("click", () =>
{
	DisplayModal("Moderation", `
		<label for="volumeSlider" class="form-label">Blocked Terms</label>
		<textarea class="form-control" id="blockedTerms" style="background-color: var(--bgColor);
			border-color: var(--primaryColor); color: var(--fontColor); height: 10vh;"
				>${config.blockedTerms.length === 0 ? "" : config.blockedTerms.join("\n")}</textarea>
	`);

	document.getElementById("blockedTerms").addEventListener("change", (e) =>
	{
		config.blockedTerms = e.currentTarget.value != "" ? e.currentTarget.value.split("\n") : [];
		localStorage.setItem("twitch_blockedTerms", JSON.stringify(config.blockedTerms));
	});
});

document.getElementById("commandsButton").addEventListener("click", () =>
{
	DisplayModal("Commands", `
		<p>!resetTTS - clears the TTS queue.</p>
		<p>!mute (name) - mutes the person.</p>
		<p>!unmute (name) - unmutes the person.</p>
		<p>!title (title) - sets the stream title.</p>
		<p>!tags (tag1), (tag2) - sets the stream tags.</p>
		<p>!category (name) - sets the stream category.</p>
	`);
});

document.getElementById("notificationsButton").addEventListener("click", () =>
{
	DisplayModal("Notifications", `
		<div class="w-100 d-flex justify-content-between align-items-center">
			<label class="form-label m-0 pe-2" for="followNotifications">New Follow</label>
			
			<div class="form-check form-switch">
				<input class="form-check-input" type="checkbox" role="switch" id="followNotifications">
			</div>
		</div>
		<div class="w-100 d-flex justify-content-between align-items-center">
			<label class="form-label m-0 pe-2" for="raidNotifications">Raid</label>
			
			<div class="form-check form-switch">
				<input class="form-check-input" type="checkbox" role="switch" id="raidNotifications">
			</div>
		</div>
	`);
	document.getElementById("followNotifications").checked = config.notifications.follow;
	document.getElementById("raidNotifications").checked = config.notifications.raid;

	document.getElementById("followNotifications").addEventListener("change", (e) =>
	{
		config.notifications.follow = e.currentTarget.checked;
		localStorage.setItem("twitch_followNotifications", config.notifications.follow);
	});
	document.getElementById("raidNotifications").addEventListener("change", (e) =>
	{
		config.notifications.raid = e.currentTarget.checked;
		localStorage.setItem("twitch_raidNotifications", config.notifications.raid);
	});
});

const AddToQueue = (username, message) =>
{
	if(config.ttsEnabled === false)
		return;

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

const UpdateSessionData = (params) =>
{
	const { token, refreshToken, expiresIn, permissions, userId } = params;

	const now = Date.now();
	const tokenExpire = now + expiresIn * 1000;

	localStorage.setItem("twitch_token", token);
	localStorage.setItem("twitch_permissions", JSON.stringify(permissions));
	localStorage.setItem("twitch_tokenExpire", tokenExpire);
	localStorage.setItem("twitch_tokenExpireInSeconds", expiresIn);

	if(refreshToken !== undefined)
		localStorage.setItem("twitch_refreshToken", refreshToken);

	client.SetParams(
	{
		token,
		tokenExpire,
		permissions,
		userId: userId ?? null
	})
}
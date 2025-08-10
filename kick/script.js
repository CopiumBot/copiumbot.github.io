let logger = new Logger(true);
let commandHandler = new CommandHandler();
let auth = new Auth(
{
	cliendId: "01K1ZWA9TB9T0ND8VCMD4WAAQ2",
	redirectUri: "https://copiumbot.github.io/kick",
	permissions: `user:read channel:read channel:write chat:write ` +
		`streamkey:read events:subscribe moderation:ban`,
	logger
});
let client = new CopeKick({ logger });

const synth = window.speechSynthesis;
let voices = [];
let voice = 0;


synth.onvoiceschanged = () =>
{
    voices = synth.getVoices();
    
    voices.forEach((item, index) =>
    {
        if(item.name == "Microsoft AvaMultilingual Online (Natural) - English (United States)")
            voice = index;

    });
}

commandHandler
.On(/^\!reset/, (channel, username, tags, message, originalMessage) =>
{
	Play();
})
.On(/^\!resetTTS/, (channel, username, tags, message, originalMessage) =>
{
	synth.cancel();
})
.On(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
	(channel, username, tags, message, originalMessage) =>
{
	AddToQueue(`${tags.displayName} sent a link`);
})
.Unhandled((channel, username, tags, message) =>
{
	AddToQueue(message);
});

const AddToQueue = (message) =>
{
    let utterance = new SpeechSynthesisUtterance(message);
    utterance.volume = 1;
    utterance.voice = voices[voice];
    synth.speak(utterance);
}

auth.On("token_received", (data) =>
{
	const now = Date.now();
	const token = data.access_token ?? null;
	const tokenExpire = now + data.expires_in * 1000 ?? null;
	const permissions = (data.scope ?? []).split(" ");

    localStorage.setItem("refreshToken", data.refresh_token ?? null);
	localStorage.setItem("token", token);
	localStorage.setItem("tokenExpire", tokenExpire);
	localStorage.setItem("permissions", JSON.stringify(permissions));

	client.SetParams(
	{
		token,
		tokenExpire,
		permissions
	});
});

client.On("token_refresh", async () =>
{
	await auth.RefreshToken(localStorage.getItem("refreshToken"));
});

client.On("connected", (channel) =>
{
	logger.Info(`Connected to channel ${channel}`);
	client.Say("Connected");
});

client.On("message", (channel, username, tags, message) =>
{
	commandHandler.HandleMessage(channel, username, tags, message);
});

const Play = async () =>
{
	if(client !== null)
	{
		synth.cancel();
		client.Disconnect();
	}

	const channelData = await auth.ConvertNameToIds(localStorage.getItem("channel"));
	client.SetParams(
	{
		channelId: channelData.channelId,
		broadcasterId: channelData.broadcasterId,
		token: localStorage.getItem("token"),
		tokenExpire: localStorage.getItem("tokenExpire"),
		permissions: JSON.parse(localStorage.getItem("permissions"))
	});

	client.Connect();
}

document.addEventListener("DOMContentLoaded", async () =>
{
	await auth.GetAuthorizationParams();
	Play();
});

document.getElementById("play").addEventListener("click", Play);

document.getElementById("stop").addEventListener("click", () =>
{
	synth.cancel();
	client.Disconnect();
});

document.getElementById("authorize").addEventListener("click", async () =>
{
	await auth.Authorize();
});
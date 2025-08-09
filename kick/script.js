let logger = new Logger(true);
let commandHandler = new CommandHandler();
const synth = window.speechSynthesis;
let voices = [];
let voice = 0;
let client = new CopeKick();

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

const Play = () =>
{
	if(client !== null)
	{
		client.Disconnect();
	}

	client = new CopeKick(
	{
		channel: "",
		logger: logger
	});

	client.Connect();

	client.On("connected", (channel) =>
	{
		logger.Info(`Connected to channel ${channel}`);
	});

	client.On("message", (channel, username, tags, message) =>
	{
		commandHandler.HandleMessage(channel, username, tags, message);
	});
}

const GenerateCodeVerifier = () =>
{
  	const array = new Uint8Array(64);
  	window.crypto.getRandomValues(array);
  	return btoa(String.fromCharCode(...array))
    	.replace(/\+/g, "-")
    	.replace(/\//g, "_")
    	.replace(/=+$/, "");
};

const GenerateCodeChallenge = async (codeVerifier) =>
{
	const encoder = new TextEncoder();
	const data = encoder.encode(codeVerifier);
	const digest = await window.crypto.subtle.digest("SHA-256", data);
	const base64Digest = btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
  	return base64Digest;
};

const Authorize = async () =>
{
	const clientId = "01K1ZWA9TB9T0ND8VCMD4WAAQ2";
	const redirectUri = "https://copiumbot.github.io/kick";
	const permissions = `user:read channel:read channel:write chat:write ` +
		`streamkey:read events:subscribe moderation:ban`;

	const codeVerifier = GenerateCodeVerifier();
	const codeChallenge = await GenerateCodeChallenge(codeVerifier);
	sessionStorage.setItem("code_verifier", codeVerifier);

	window.location.href = `https://id.kick.com/oauth/authorize?` +
	`response_type=code` + 
	`&client_id=${encodeURIComponent(clientId)}` + 
	`&redirect_uri=${encodeURIComponent(redirectUri)}` +
	`&scope=${encodeURIComponent(permissions)}` +
	`&code_challenge=${encodeURIComponent(codeChallenge)}` +
	`&code_challenge_method=S256` +
	`&state=cope_bot`;
}

const GetAuthorizationParams = async () =>
{
	const code_verifier = sessionStorage.getItem("code_verifier");

	const params = new URLSearchParams(window.location.search);
	console.log(params)
	const code = params.get("code");
	const state = params.get("state");

	console.log(code)
	console.log(state)
	console.log(code_verifier)

	if(!code || !state || !code_verifier)
		return;

	if(state !== "cope_bot")
		return;

	try
	{
		const response = await fetch("https://cope-bot-backend.vercel.app/api/login/callback?platform=kick",
		{
			method: "POST",
			headers:
			{
				"Content-Type": "application/json"
			},
			body: JSON.stringify(
			{
				code,
				state,
				code_verifier
			})
		});

		console.log(response.status)

		const data = await response.json();
		console.log(data)
	}
	catch(error)
	{
		logger.Error(`Error while sending data: ${logger.JSON(error)}`);
	}
}

document.addEventListener("DOMContentLoaded", () =>
{
	GetAuthorizationParams();
	//Play();
});
document.getElementById("play").addEventListener("click", Play);

document.getElementById("stop").addEventListener("click", () =>
{
	synth.cancel();
	client.Disconnect();
});

document.getElementById("authorize").addEventListener("click", () =>
{
	Authorize();
});
class Auth
{
    constructor(params)
    {
        this.clientId = params.clientId ?? null;
        this.redirectUri = params.redirectUri ?? null;
        this.permissions = params.permissions ?? null;
        this.platform = params.platform ?? null;
        this._events = {};
        this.logger = params.logger ?? 
        {
            Info: (message) => console.log(`[INFO] ${message}`),
            Error: (message) => console.log(`[ERROR] ${message}`),
            Push: console.log,
            SetFlushState: () => {},
            JSON: (obj) =>
            {
                const data = {};
                for (const key in obj)
                    data[key] = obj[key];
                
                return JSON.stringify(data, null, 4);
            }
        };
    }

    _Emit(event, ...args)
    {
        const listeners = this._events[event];
        if(listeners)
            listeners.forEach(listener => listener(...args));
    }

    On(event, listener)
    {
        if(!this._events[event])
            this._events[event] = [];

        this._events[event].push(listener);
    }

    _GenerateCodeVerifier()
    {
        const array = new Uint8Array(64);
        window.crypto.getRandomValues(array);
        return btoa(String.fromCharCode(...array))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    };

    async _GenerateCodeChallenge(codeVerifier)
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

    async Authorize()
    {
        if(!this.clientId || !this.redirectUri || !this.permissions)
            return;

        const code_verifier = this._GenerateCodeVerifier();
        const codeChallenge = await this._GenerateCodeChallenge(code_verifier);
        sessionStorage.setItem("code_verifier", code_verifier);

        window.location.href = `https://id.kick.com/oauth/authorize?` +
        `response_type=code` + 
        `&client_id=${encodeURIComponent(this.clientId)}` + 
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&scope=${encodeURIComponent(this.permissions)}` +
        `&code_challenge=${encodeURIComponent(codeChallenge)}` +
        `&code_challenge_method=S256` +
        `&state=cope_bot`;
    }

    async GetAuthorizationParams()
    {
        const code_verifier = sessionStorage.getItem("code_verifier");

        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");

        if(!code || !state || !code_verifier || !this.platform)
            return;

        if(state !== "cope_bot")
            return;

        try
        {
            const response = await fetch(`https://cope-bot-backend.vercel.app/api/login/callback?platform=${this.platform}`,
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

            if(!response.ok)
            {
                logger.Error(`Failed to get access token. Error code: ${response.status}`);
                return;
            }

            const data = await response.json();
            this._Emit("token_received",
                data
            );
            logger.Info("Token received");
        }
        catch(error)
        {
            logger.Error(`Error while sending data: ${logger.JSON(error)}`);
        }
    }

    async RefreshToken(refresh_token)
    {
        if(!refresh_token || !this.platform)
            return;

        try
		{
			const response = await fetch(`https://cope-bot-backend.vercel.app/api/login/refresh?platform=${this.platform}`,
			{
				method: "POST",
				headers:
				{
					"Content-Type": "application/json"
				},
				body: JSON.stringify(
				{
					refresh_token
				})
			});

			if(!response.ok)
			{
				logger.Error(`Failed to refresh access token. Error code: ${response.status}`);
				return;
			}

			const data = await response.json();
			this._Emit("token_received",
                data
            );
			logger.Info("Token refreshed");
		}
		catch(error)
		{
			logger.Error(`Error while sending data: ${logger.JSON(error)}`);
		}
    }

    async ConvertNameToIds(name)
    {
        if(!name)
            return;

        try
        {
            const response = await fetch(`https://kick.com/api/v2/channels/${name}/chatroom`,
            {
                method: "GET"
            });

            if(!response.ok)
            {
                this.logger.Error(`Failed to convert name to id. Error code: ${response.status}`);
                return false;
            }

            const data = await response.json();
            return {
                channelId: data.channel_id ?? null,
                broadasterId: data.id ?? null
            };
        }
        catch(error)
        {
            this.logger.Error(`Failed to convert name to id: ${this.logger.JSON(error)}`);
            return false;
        }
    }
}
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

    Authorize()
    {
        if(!this.clientId || !this.redirectUri || !this.permissions)
            return;

        const code_verifier = this._GenerateCodeVerifier();
        sessionStorage.setItem("code_verifier", code_verifier);

        window.location.href = `https://id.twitch.tv/oauth2/authorize?` +
        `response_type=code` + 
        `&client_id=${encodeURIComponent(this.clientId)}` + 
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&scope=${encodeURIComponent(this.permissions)}` +
        `&state=${encodeURIComponent(code_verifier)}`;
    }

    async ValidateToken(token)
    {
        try
        {
            const response = await fetch(`https://id.twitch.tv/oauth2/validate`,
            {
                method: "GET",
                headers:
                {
                    "Authorization": `Bearer ${token}`
                }
            });

            if(!response.ok)
            {
                logger.Error(`Failed to validate access token. Error: (${response.status}) ${response.statusText}`);
                return null;
            }

            logger.Info("Token validated");
            const data = await response.json();
            return data;
        }
        catch(error)
        {
            logger.Error(`Error while sending data2: ${logger.JSON(error)}`);
            return null;
        }
    }

    async GetAuthorizationParams()
    {
        const code_verifier = sessionStorage.getItem("code_verifier");

        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const scope = params.get("scope");
        const error = params.get("error");
        const error_description = params.get("error_description");

        if(!state || !code_verifier || !this.platform)
            return;

        if(state !== code_verifier)
            return;

        if(code && scope)
        {
            try
            {
                const response = await fetch(`https://cope-bot-backend.vercel.app/api/token/callback?platform=${this.platform}`,
                {
                    method: "POST",
                    headers:
                    {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(
                    {
                        code,
                        state
                    })
                });

                if(!response.ok)
                {
                    logger.Error(`Failed to get access token. Error: (${response.status}) ${response.statusText}`);
                    return;
                }

                logger.Info("Token received");
                const data = await response.json();
                this._Emit("authorized",
                    data
                );
            }
            catch(error)
            {
                logger.Error(`Error while sending data: ${logger.JSON(error)}`);
            }
        }
        else if(error && error_description)
        {
            logger.Error(decodeURIComponent(error_description));
        }
    }

    async RefreshToken(refresh_token)
    {
        if(!refresh_token || !this.platform)
            return null;

        try
		{
			const response = await fetch(`https://cope-bot-backend.vercel.app/api/token/refresh?platform=${this.platform}`,
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
				logger.Error(`Failed to refresh access token. Error: (${response.status}) ${response.statusText}`);
				return null;
			}

            logger.Info("Token refreshed");
			const data = await response.json();
			return data;
		}
		catch(error)
		{
			logger.Error(`Error while sending data: ${logger.JSON(error)}`);
            return null;
		}
    }
}
class CopeTwitch
{
    constructor(params = {})
    {
        this.token = params.token ?? null;
        this.tokenExpire = params.tokenExpire ?? Date.now();
        this.permissions = params.permissions ?? [];
        this.clientId = params.clientId ?? null;
        this.userId = params.userId ?? null;
        
        this._events = {};
        this._socket = null;
        this._connected = false;
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

    async _Emit(event, ...args)
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

    _Send(data)
    {
        this._socket?.send(JSON.stringify(data));
    }

    SetParams(params = {})
    {
        for( const [key, value] of Object.entries(params))
        {
            if(key in this)
                this[key] = value;
        }
    }

    async Connect()
    {
        if(!this.token || !this.clientId || !this.tokenExpire)
            return;

        this._socket = new WebSocket(`wss://eventsub.wss.twitch.tv/ws`);
        this._socket.onopen = () =>
        {
            this._Emit("connecting");
        };

        this._socket.onmessage = (message) =>
        {
            const data = JSON.parse(message.data);
            this._HandleEvent(data);
        }

        this._socket.onclose = (reason) => 
        {
            this._connected = false;
            this._Emit("disconnected", reason);
        }

        this._socket.onerror = (error) =>
        {
            this._connected = false;
            this._Emit("error", error);
        }
    }

    Disconnect()
    {
        if(this._socket)
        {
            this._socket.close();
            this._socket = null;
        }
        
        if(this._connected)
            this.logger.Info("Disconnected by user");
        
        this._connected = false;
    }

    async _HandleEvent(message)
    {
        const metadata = message.metadata;
        const payload = message.payload;
        switch(metadata.message_type)
        {
            case "session_welcome":
                let success = false;
                success = await this.SubscribeToEvent("channel.chat.message", "1",
                {
                    "broadcaster_user_id": this.userId,
                    "user_id": this.userId
                },
                {
                    "method": "websocket",
                    "session_id": payload?.session?.id
                });
                success = await this.SubscribeToEvent("channel.follow", "2",
                {
                    "broadcaster_user_id": this.userId,
                    "moderator_user_id": this.userId
                },
                {
                    "method": "websocket",
                    "session_id": payload?.session?.id
                });
                if(success)
                    this._Emit("connected");
                break;

            case "session_keepalive":
                break;

            case "session_reconnect":
                this.Disconnect();
                setTimeout(() =>
                {
                    this.Connect();
                }, 1000);
                break;

            case "notification":
                switch(payload.subscription.type)
                {
                    case "channel.chat.message":
                        this._Emit("message",
                            payload.event?.broadcaster_user_name,
                            payload.event?.chatter_user_name,
                            payload.event,
                            payload.event?.message?.text
                        );
                        break;

                    case "channel.follow":
                        this._Emit("follow",
                            payload.event?.user_name,
                            payload.event?.user_login,
                            payload.event?.user_id,
                            payload.event?.followed_at
                        );
                        break;

                    default:
                        this.logger.Error(`Unhandled notification from the server: \n${this.logger.JSON(message)}`);
                        break;
                }

                break;

            default:
                this.logger.Error(`Unhandled message from the server: \n${this.logger.JSON(message)}`);
                break;
        }
    }

    GetPermissions()
    {
        return this.permissions;
    }

    async SubscribeToEvent(type, version, condition, transport)
    {
        if(!(this.permissions).includes("channel:read:subscriptions"))
            return false;

        if(this.tokenExpire < Date.now())
            await this._Emit("request_token_refresh");

        try
	    {
            const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions",
            {
                method: "POST",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Client-Id": this.clientId,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(
                {
                    type,
                    version,
                    condition,
                    transport
                })
            });

            if(!response.ok)
            {
                this.logger.Error(`External API error. Error code: ${response.status}`);
                return false;
            }

            const data = await response.json();
            return data.data[0].status === "enabled";
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
            return false;
        }
    }

    async Say(message)
    {
        if(!(this.permissions).includes("user:write:chat"))
            return;

        if(!(this.permissions).includes("user:bot"))
            return;

        if(this.tokenExpire < Date.now())
            await this._Emit("request_token_refresh");

        const maxLength = 500;
        if(message.length > maxLength)
        {
            const msg = message;
            let lastSpace = msg.slice(0, maxLength).lastIndexOf(" ");

            if(lastSpace === -1)
                lastSpace = maxLength;

            message = msg.slice(0, lastSpace);

            setTimeout(() =>
            {
                this.Say(msg.slice(lastSpace));
            }, 350);
        }

        try
	    {
            const response = await fetch("https://api.twitch.tv/helix/chat/messages",
            {
                method: "POST",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Client-Id": this.clientId,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(
                {
                    "sender_id": this.userId,
                    "broadcaster_id": this.userId,
                    message
                })
            });

            if(!response.ok)
                this.logger.Error(`External API error. Error code: ${response.status}`);
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
        }
    }

    async Ban(user_id, duration, reason)
    {
        if(!(this.permissions).includes("moderator:manage:banned_users"))
            return;

        if(this.tokenExpire < Date.now())
            await this._Emit("request_token_refresh");

        try
	    {
            const response = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${this.userId}&moderator_id=${this.userId}`,
            {
                method: "POST",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Client-Id": this.clientId,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(
                {
                    data:
                    {
                        user_id,
                        ...(duration !== null && { duration }),
                        ...(reason !== null && { reason })
                    }
                })
            });

            if(!response.ok)
                this.logger.Error(`External API error. Error code: ${response.status}`);
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
        }
    }

    async UpdateChannelData(field)
    {
        if(!(this.permissions).includes("channel:manage:broadcast"))
            return;

        if(this.tokenExpire < Date.now())
            await this._Emit("request_token_refresh");

        try
	    {
            const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${this.userId}`,
            {
                method: "PATCH",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Client-Id": this.clientId,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(
                    field
                )
            });

            if(!response.ok)
                this.logger.Error(`External API error. Error code: ${response.status}`);
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
        }
    }

    async GetCategory(name)
    {
        if(this.tokenExpire < Date.now())
            await this._Emit("request_token_refresh");

        try
	    {
            const response = await fetch(`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(name)}`,
            {
                method: "GET",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Client-Id": this.clientId
                }
            });

            if(!response.ok)
            {
                this.logger.Error(`External API error. Error code: ${response.status}`);
                return [];
            }
                
            const data = await response.json();
            return data.data;
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
            return [];
        }
    }

    async GetFollowers()
    {
        if(!(this.permissions).includes("moderator:read:followers"))
            return [];

        if(this.tokenExpire < Date.now())
            await this._Emit("request_token_refresh");

        try
	    {
            const response = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${this.userId}`,
            {
                method: "GET",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Client-Id": this.clientId
                }
            });

            if(!response.ok)
            {
                this.logger.Error(`External API error. Error code: ${response.status}`);
                return [];
            }
                
            const data = await response.json();
            return data.data;
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
            return [];
        }
    }
}
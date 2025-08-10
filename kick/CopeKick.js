class CopeKick
{
    constructor(params = {})
    {
        this.channel = params.channel ?? null;
        this.channelId = params.channelId ?? null;
        this.broadasterId = params.broadasterId ?? null;

        this.token = params.token ?? null;
        this.tokenExpire = params.tokenExpire ?? Date.now();
        this.permissions = params.permissions ?? {};
        
        this._events = {};
        this._wsCluster = "32cbd69e4b950bf97679";
        this._socket = null;
        this._connected = false;
        this._pingInterval = null;
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
        if(!this.channelId || !this.broadasterId)
        {
            this.logger.Error("No channel id or broadcaster id provided");
            return;
        }

        this._socket = new WebSocket(`wss://ws-us2.pusher.com/app/${this._wsCluster}?protocol=7&client=js&version=8.4.0&flash=false`);
        this._socket.onopen = () =>
        {
            const subscriptions =
            [
                `chatroom_${this.broadasterId}`, `chatrooms.${this.broadasterId}.v2`,
                `channel.${this.channelId}`, `channel_${this.channelId}`, `chatrooms.${this.broadasterId}`,
                `predictions-channel-${this.channelId}`
            ];
            subscriptions.forEach((item) =>
            {
                this._Send(
                {
                    event: "pusher:subscribe",
                    data:
                    {
                        auth: "",
                        channel: item
                    }
                });
            });
        };

        this._socket.onmessage = (message) =>
        {
            const data = JSON.parse(message.data);
            this._HandleEvent(data);
        }

        this._socket.onclose = (reason) => 
        {
            this._connected = false;
            if(this._pingInterval)
            {
                clearInterval(this._pingInterval);
                this._pingInterval = null;
            }
            this._Emit("disconnected", reason);
        }

        this._socket.onerror = (error) =>
        {
            this._connected = false;
            if(this._pingInterval)
            {
                clearInterval(this._pingInterval);
                this._pingInterval = null;
            }
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

        if(this._pingInterval)
        {
            clearInterval(this._pingInterval);
            this._pingInterval = null;
        }
        
        if(this._connected)
            this.logger.Info("Disconnected by user");
        
        this._connected = false;
    }

    _HandleEvent(message)
    {
        const data = JSON.parse(message.data);
        switch(message.event)
        {
            case "pusher:connection_established":
                this._connected = true;
                this._Emit("connected",
                    this.channel,
                    data.socket_id ?? null,
                    data.activity_timeout ?? null
                );

                this._pingInterval = setInterval(() =>
                {
                    if(!this._pingInterval)
                        return;

                    this._Send({
                        event: "pusher:ping"
                    });
                }, data.activity_timeout * 1000);
                break;

            case "pusher_internal:subscription_succeeded":
                console.log(message)
                this._Emit("pusher_subscription_succeeded",
                    message.channel
                );
                break;

            case "pusher:pong":
                break;

            case "App\\Events\\ChatMessageEvent":
                this._Emit("message",
                    data.chatroom_id ?? null,
                    data.sender.slug ?? null,
                    {
                        time: data.created_at ?? null,
                        messageId: data.id ?? null,
                        messageRef: data.metadata?.message_ref ?? null,
                        userId: data.sender?.id ?? null,
                        badges: data.sender?.identity?.badges ?? null,
                        color: data.sender?.identity?.color ?? null,
                        displayName: data.sender?.username ?? null
                    },
                    data.content ?? null
                );
                break;

            case "App\\Events\\UserBannedEvent":
                this._Emit("ban",
                    {
                        id: data.user?.id ?? null,
                        displayName: data.user?.username ?? null,
                        username: data.user?.slug ?? null
                    },
                    {
                        id: data.banned_by?.id ?? null,
                        displayName: data.banned_by?.username ?? null,
                        username: data.banned_by?.slug ?? null
                    },
                    data.permanent ?? null,
                    data.permanent ? 0 : (data.duration ?? null),
                    data.permanent ? 0 : (data.expires_at ?? null)
                );
                break;

            case "App\\Events\\UserUnbannedEvent":
                this._Emit("unban",
                    {
                        id: data.user?.id ?? null,
                        displayName: data.user?.username ?? null,
                        username: data.user?.slug ?? null
                    },
                    {
                        id: data.unbanned_by?.id ?? null,
                        displayName: data.unbanned_by?.username ?? null,
                        username: data.unbanned_by?.slug ?? null
                    }
                );
                break;

            case "App\\Events\\ChatroomUpdatedEvent":
                this._Emit("chat_settings_updated",
                    data.id,
                    {
                        enabled: data.slow_mode?.enabled ?? null,
                        interval: data.slow_mode?.message_interval ?? null
                    },
                    {
                        enabled: data.subscribers_mode?.enabled ?? null
                    },
                    {
                        enabled: data.followers_mode?.enabled ?? null,
                        duration: data.followers_mode?.min_duration ?? null
                    },
                    {
                        enabled: data.emotes_mode?.enabled ?? null
                    },
                    {
                        enabled: data.advanced_bot_protection?.enabled ?? null,
                        remaining_time: data.advanced_bot_protection?.remaining_time ?? null
                    },
                    {
                        enabled: data.account_age?.enabled ?? null,
                        duration: data.account_age?.min_duration ?? null
                    }
                );
                break;

            /*case "App\\Events\\StreamerIsLive":
                break;
            case "App\\Events\\StopStreamBroadcast":
                break;
                
            case "App\\Events\\MessageDeletedEvent":
                break;
            
            case "App\\Events\\StreamHostEvent":
                break;
                
            case "App\\Events\\ChannelSubscriptionEvent":
                break;*/

            default:
                this.logger.Error(`Unhandled message from the server: \n${this.logger.JSON(message)}`);
                break;
        }
    }

    async Say(message)
    {
        if(!(this.permissions).includes("chat:write"))
            return;

        if(this.tokenExpire < Date.now())
            this._Emit("token_refresh");

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
            const response = await fetch("https://api.kick.com/public/v1/chat",
            {
                method: "POST",
                headers:
                {
                    "Authorization": `Bearer ${this.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(
                {
                    content: message,
                    type: "bot"
                })
            });

            if(!response.ok)
            {
                this.logger.Error(`External API error. Error code: ${response.status}`);
                return;
            }

            const data = await response.json();
            if(!data.data.is_sent)
                this.logger.Error(`Failed to send a message. Error code: ${response.status}`);
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
        }
    }
}
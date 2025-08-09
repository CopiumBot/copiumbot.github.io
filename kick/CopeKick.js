class CopeKick
{
    constructor(params = {})
    {
        this.channel = params.channel ?? null;
        this.channelId = null;
        this.broadasterId = null;

        this.token = params.token ?? null;
        this.tokenExpire = params.tokenExpire ?? Date.now();
        
        this._events = {};
        this._wsLink = "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false";
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

    async _ConvertNameToId(name)
    {
        try
        {
            const response = await fetch(`https://kick.com/api/v2/channels/${this.channel}/`,
            {
                method: "GET"
            });

            if(!response.ok)
            {
                this.logger.Error(`Failed to convert name to id. Error code: ${response.status}`);
                return false;
            }

            const data = await response.json();
            this.channelId = data.chatroom.channel_id;
            this.broadasterId = data.chatroom.id;
            return true;
        }
        catch(error)
        {
            this.logger.Error(`Failed to convert name to id: ${this.logger.JSON(error)}`);
            return false;
        }
    }

    async Connect()
    {
        if(!this.channel)
        {
            this.logger.Error("No channel provided");
            return;
        }
            
        if(!(await this._ConvertNameToId()))
            return;

        this._socket = new WebSocket(this._wsLink);
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
                    data.socket_id,
                    data.activity_timeout
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
                    data.chatroom_id,
                    data.sender.slug,
                    {
                        time: data.created_at,
                        messageId: data.id,
                        messageRef: data.metadata.message_ref,
                        userId: data.sender.id,
                        badges: data.sender.identity.badges,
                        color: data.sender.identity.color,
                        displayName: data.sender.username
                    },
                    data.content
                );
                break;

            case "App\\Events\\UserBannedEvent":
                this._Emit("ban",
                    {
                        id: data.user.id,
                        displayName: data.user.username,
                        username: data.user.slug
                    },
                    {
                        id: data.banned_by.id,
                        displayName: data.banned_by.username,
                        username: data.banned_by.slug
                    },
                    data.permanent,
                    data.permanent ? 0 : data.duration,
                    data.permanent ? 0 : data.expires_at
                );
                break;

            case "App\\Events\\UserUnbannedEvent":
                this._Emit("unban",
                    {
                        id: data.user.id,
                        displayName: data.user.username,
                        username: data.user.slug
                    },
                    {
                        id: data.unbanned_by.id,
                        displayName: data.unbanned_by.username,
                        username: data.unbanned_by.slug
                    }
                );
                break;

            case "App\\Events\\ChatroomUpdatedEvent":
                this._Emit("chat_settings_updated",
                    data.id,
                    {
                        enabled: data.slow_mode.enabled,
                        interval: data.slow_mode.message_interval
                    },
                    {
                        enabled: data.subscribers_mode.enabled
                    },
                    {
                        enabled: data.followers_mode.enabled,
                        duration: data.followers_mode.min_duration
                    },
                    {
                        enabled: data.emotes_mode.enabled
                    },
                    {
                        enabled: data.advanced_bot_protection.enabled,
                        remaining_time: data.advanced_bot_protection.remaining_time
                    },
                    {
                        enabled: data.account_age.enabled,
                        duration: data.account_age.min_duration
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
            if(!data.is_sent)
                this.logger.Error(`Failed to send a message. Error code: ${response.status}`);
        }
        catch(error)
        {
            this.logger.Error(`Error while sending data: ${this.logger.JSON(error)}`);
        }
    }
}
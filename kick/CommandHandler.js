class CommandHandler
{
    constructor()
    {
        this.commands = [];
        this.unhandled = null;
    }

    On(regex, callback)
    {
        this.commands.push(
        {
            regex: new RegExp(regex),
            callback
        });
        return this;
    }

    Unhandled(callback)
    {
        this.unhandled = callback;

        return this;
    }

    HandleMessage(channel, username, tags, message)
    {
        for(const command of this.commands)
        {
            const match = message.match(command.regex);
            if(match)
            {
                command.callback(channel, username, tags, message.replace(message, ""), message);
                return;
            }
        }

        if(this.unhandled)
            this.unhandled(channel, username, tags, message);
    }
}
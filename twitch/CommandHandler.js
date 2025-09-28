class CommandHandler
{
    constructor()
    {
        this.commands = [];
        this.unhandled = null;
    }

    IsMod(tags)
    {
        return tags.some(tag => tag.set_id === "moderator" ||
            tag.set_id === "broadcaster"
        );
    }

    On(regex, modOnly, callback)
    {
        this.commands.push(
        {
            regex: new RegExp(regex),
            modOnly,
            callback
        });
        return this;
    }

    OnArray(array, modOnly, callback)
    {
        array.forEach(regex =>
        {
            this.commands.push(
            {
                regex: new RegExp(regex),
                modOnly,
                callback
            });
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
            if(command.modOnly && !this.IsMod(tags.badges))
                continue;

            const match = message.match(command.regex);
            if(match)
            {
                command.callback(channel, username, tags, message.replace(command.regex, ""), message);
                return;
            }
        }

        if(this.unhandled)
            this.unhandled(channel, username, tags, message);
    }
}
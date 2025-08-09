class Logger
{
    constructor(flushEnabled)
    {
        this.flushEnabled = flushEnabled ?? false;
        this.buffer = [];
    }

    JSON(json)
    {
        const data = {};
        for (const key in json)
            data[key] = json[key];

        return JSON.stringify(data, null, 4);
    }

    SetFlushState(state)
    {
        this.flushEnabled = state;

        if(!state)
            return;

        this.buffer.forEach((item, index, arr) =>
        {
            console.log(`%c[COPE] %c${item.type} %c${item.message}`, "color: #20f52a", `color: ${item.color}`, "color: white");
        });
        this.buffer = [];
    }

    Info(message)
    {
        this.Push("[INFO]", "#2e62ff", message);
    }

    Error(message)
    {
        this.Push("[ERROR]", "#ff4545", message);
    }

    Push(type, color, message)
    {
        if(this.flushEnabled)
        {
            console.log(`%c[COPE] %c${type} %c${message}`, "color: #20f52a", `color: ${color}`, "color: white");
            return;
        }
        
        this.buffer.push({type, color, message});
    }
}
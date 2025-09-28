class Logger
{
    constructor() {}

    JSON(json)
    {
        const data = {};
        for (const key in json)
            data[key] = json[key];

        return JSON.stringify(data, null, 4);
    }

    Info(message)
    {
        console.log(`%c[COPE] %c[INFO] %c${message}`, "color: #20f52a", `color: #2e62ff`, "color: white");
    }

    Error(message)
    {
        console.log(`%c[COPE] %c[ERROR] %c${message}`, "color: #20f52a", `color: #ff4545`, "color: white");
    }
}
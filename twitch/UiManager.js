let userSettings = new Map();
const synth = window.speechSynthesis;
let voices = [];

synth.onvoiceschanged = () =>
{
    voices = synth.getVoices();
    if(config.voice == null)
        config.voice = voices[0].name;
}

const SetConnectionStatus = (status) =>
{
    let color;
    switch(status.toLowerCase())
    {
        case "connecting":
            color = "var(--pending)";
            break;
        case "connected":
            color = "var(--success)";
            break;
        case "error":
            color = "var(--ff6b6b)";
            break;
        default:
            color = "#6c757d";
            break;
    }

    document.getElementById("statusDot").style.backgroundColor = color;
    document.getElementById("connectionStatus").innerText = status;
}

const predefinedTags = 
{
    "broadcaster":
    {
        name: "Streamer", color: "rgb(233, 25, 22)"
    },
    "moderator":
    {
        name: "Mod", color: "rgb(0, 173, 3)"
    },
    "subscriber":
    {
        name: "Sub", color: "rgba(57, 143, 255)"
    },
    "vip":
    {
        name: "VIP", color: "rgb(224, 5, 185)"
    }
}

const AddChatMessage = (color, displayName, username, message, tags = []) =>
{
    const chatMessagesElement = document.getElementById("chatMessages");
    const messageElement = document.createElement("div");
    messageElement.classList.add("chatMessage");

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const time = `${hours}:${minutes}:${seconds}`;

    const matchedTags = tags.map(tag =>
        predefinedTags[tag.set_id]
    ).filter(tag =>
        tag
    );

    const tagsHTML = matchedTags.map(tag =>
        `<span class="tag" style="background-color: ${tag.color};">${tag.name}</span>`
    ).join("");

    messageElement.innerHTML = `
        <div class="messageHeader">
            <span class="messageUsername" style="color: ${color}; cursor: pointer;"
                onclick="DisplayUserModal('${username}')">
                ${displayName}
            </span>
            ${tagsHTML}
            <span class="messageTime">
                ${time}
            </span>
        </div>
        <div>
            ${message}
        </div>
    `;

    chatMessagesElement.appendChild(messageElement);
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
}

const AddChatNotification = (notification) =>
{
    const chatMessagesElement = document.getElementById("chatMessages");
    const messageElement = document.createElement("div");
    
    messageElement.innerHTML = `
        <span style="color: #bbb;">
            ${notification}
        </span>
    `;

    chatMessagesElement.appendChild(messageElement);
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
}

const FormatTime = (date) =>
{
    const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    const now = new Date();
    const followTime = new Date(date);
    const diffInMinutes = Math.floor((now - followTime) / 60000);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    const diffInMonths = Math.floor(diffInDays / 30.44);
    const diffInYears = Math.floor(diffInDays / 365.25);

    if(diffInYears > 0)
        return rtf.format(-diffInYears, "year");
    else if(diffInMonths > 0)
        return rtf.format(-diffInMonths, "month");
    else if(diffInDays > 0)
        return rtf.format(-diffInDays, "day");
    else if(diffInHours > 0)
        return rtf.format(-diffInHours, "hour");
    else if(diffInMinutes > 0)
        return rtf.format(-diffInMinutes, "minute");
    else
        return "Just now"
}

const AddFollower = (username, time) =>
{
    const followersElement = document.getElementById("followers");
    const messageElement = document.createElement("div");

    messageElement.innerHTML = `
        <div class="followCard">
            <i class="fa-solid fa-heart"></i>
            <div>
                <p>
                    ${username}
                </p>
                <span>Followed you </span>
                <span style="color: #999;">
                    ${FormatTime(time)}
                </span>
            </div>
        </div>
    `;

    followersElement.appendChild(messageElement);
    followersElement.scrollTop = followersElement.scrollHeight;
}

const DisplayChatters = async () =>
{
    const [chatters, mods, vips] = await Promise.all(
    [
        client.GetChatters(),
        client.GetMods(),
        client.GetVips()
    ]);

    const broadcasterId = client.GetUserId();
    const broadcaster = [];
    const finalMods = [];
    const finalVips = [];
    const finalChatters = [];

    for(const [id, data] of chatters.entries())
    {
        if(broadcasterId === id)
            broadcaster.push(data.displayName);
        else if(mods.has(id))
            finalMods.push(data.displayName);
        else if(vips.has(id))
            finalVips.push(data.displayName);
        else
            finalChatters.push(data.displayName);
    }

    const chattersElement = document.getElementById("chatters");
    chattersElement.innerHTML = "";

    ChattersSection("Broadcaster", broadcaster);
    ChattersSection("Moderators", finalMods);
    ChattersSection("VIPs", finalVips);
    ChattersSection("Viewers", finalChatters);
}

const ChattersSection = (title, chatters, color) =>
{
    if(chatters.length === 0)
        return;

    const chattersElement = document.getElementById("chatters");
    const div = document.createElement("div");
    div.classList.add("mb-3");
    //div.classList.add("border-bottom");

    let listElement = "";

    chatters.forEach((item, index) =>
    {
        listElement += `
            <p class="fw-bold" style="color: var(--primaryDarkerColor);
                margin: 0; font-size: 1.7vh">${item}</p>
        `;
    });

    div.innerHTML = `
        <p class="fw-bold" style="font-size: 1.2vh; color: #999;
            margin: 0;">${title}</p>
        ${listElement}
    `;

    chattersElement.appendChild(div);
}

const DisplayModal = (title, content) =>
{
    const modalContainer = document.getElementById("modalContainer");
    modalContainer.innerHTML = `
        <div class="modal fade" id="dynamicModal">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background-color: var(--panelColor); 
                    box-shadow: 0 0 2rem 0.5rem rgba(255, 255, 255, 0.1)">
                    <div class="modal-header">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"
                            aria-label="Close" style="color: var(--fontColor)"></button>
                    </div>

                    <div class="modal-body">
                        ${content}
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalElement = document.getElementById("dynamicModal");
    const modal = new bootstrap.Modal(modalElement);

    modal.show();

    modalElement.addEventListener("hidden.bs.modal", () => 
    {
        modalContainer.innerHTML = "";
    });
}

const DisplayUserModal = (username) =>
{
    const mutedHTML = userSettings.has(username) ?
        (userSettings.get(username).muted ? "checked" : "") : "";
    const savedVoice = userSettings.has(username) ? userSettings.get(username).voice : "default";

    let voiceListHTML = `
        <option value="default" style="color: var(--fontColor);" selected}>Default</option>
    `;
    voices.forEach((item, index) =>
    {
        const isSelected = item.name == savedVoice ? "selected" : "";
        voiceListHTML += `
            <option value="${item.index}" style="color: var(--fontColor);" ${isSelected}>
                ${item.name} (${item.lang})</option>
        `;
    });

    const modalContainer = document.getElementById("modalContainer");
    modalContainer.innerHTML = `
        <div class="modal fade" id="dynamicModal">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background-color: var(--panelColor); 
                    box-shadow: 0 0 2rem 0.5rem rgba(255, 255, 255, 0.1)">
                    <div class="modal-header">
                        <h5 class="modal-title">${username}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"
                            aria-label="Close" style="color: var(--fontColor)"></button>
                    </div>

                    <div class="modal-body">
                        <label class="form-label m-0 pe-2 mb-2" for="userModalVoiceSelect">Voice</label>
                        <select class="form-select mb-3" id="userModalVoiceSelect" style="background-color: var(--bgColor);
                            border-color: var(--primaryColor); cursor: pointer; color: var(--fontColor);">
                            ${voiceListHTML}
                        </select>

                        <div class="w-100 d-flex justify-content-between align-items-center">
                            <label class="form-label m-0 pe-2" for="muteUser">Mute</label>
                            
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="userModalMute" ${mutedHTML}>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button type="button" id="userModalSaveButton" class="btn"
                            style="background-color: var(--primaryColor);">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalElement = document.getElementById("dynamicModal");
    const modal = new bootstrap.Modal(modalElement);

    modal.show();

    modalElement.addEventListener("hidden.bs.modal", () => 
    {
        modalContainer.innerHTML = "";
    });

    document.getElementById("userModalSaveButton").addEventListener("click", () =>
    {
        const voiceIndex = document.getElementById("userModalVoiceSelect").selectedIndex;
        const isMuted = document.getElementById("userModalMute").checked;

        if(voiceIndex == 0 && isMuted == false)
            userSettings.delete(username);
        else
        {
            userSettings.set(username,
            {
                muted: isMuted,
                voice: voiceIndex != 0 ? voices[voiceIndex - 1].name : "default"
            });
        }
        modal.hide();

        const arrayUserSettings = Array.from(userSettings);
        localStorage.setItem("twitch_userSettings", JSON.stringify(arrayUserSettings));
    });
}

document.addEventListener("DOMContentLoaded", () =>
{
    const arrayUserSettings = localStorage.getItem("twitch_userSettings") !== null ?
        JSON.parse(localStorage.getItem("twitch_userSettings")) : [];
    userSettings = new Map(arrayUserSettings);

    document.addEventListener("hide.bs.modal", () =>
    {
        if(document.activeElement)
            document.activeElement.blur();
    });

    document.body.addEventListener("input", (e) =>
    {
        const target = e.target;
        if(!target.classList.contains("form-range"))
            return;

        const value = target.value;
        const min = target.min || 0;
        const max = target.max || 100;
        const percent = ((value - min) / (max - min)) * 100;
        target.style.setProperty("--range-fill", `${percent}%`);
    });
});
import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export default definePluginSettings({
    fakeMute: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "appears as muted to others when fake deafen is enabled",
    },
    fakeDeafen: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "appears as deafened to others when fake deafen is enabled",
    },
    showButton: {
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true,
        description: "show the fake deafen button in the account area",
    },
    enableKeybind: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "enable the keybind (ctrl+shift+q) to toggle fake deafen",
    }
});
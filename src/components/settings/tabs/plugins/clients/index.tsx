/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { PluginClient } from "@utils/types";
import { Tooltip } from "@webpack/common";
import equicordIcon from "file://equicord.png?base64";
import sudocordIcon from "file://sudocord.png?base64";
import vencordIcon from "file://vencord.png?base64";

import { PluginMeta } from "~plugins";

const cl = classNameFactory("vc-plugins-");

const png = (base64: string) => `data:image/png;base64,${base64}`;

// no official logo, so a plain crescent moon
const nightcordIcon = "data:image/svg+xml;base64," + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1e1b4b"/><path d="M15.5 17.5A6.5 6.5 0 0 1 10 6a6.5 6.5 0 1 0 8 9.9 6.5 6.5 0 0 1-2.5 1.6z" fill="#c4b5fd"/></svg>'
);

export const PluginClients: Record<PluginClient, { name: string; icon: string; }> = {
    sudocord: { name: "SudoCord", icon: png(sudocordIcon) },
    vencord: { name: "Vencord", icon: png(vencordIcon) },
    equicord: { name: "Equicord", icon: png(equicordIcon) },
    nightcord: { name: "Nightcord", icon: nightcordIcon },
};

export function getPluginClient(plugin: { name: string; client?: PluginClient; }): PluginClient {
    return plugin.client ?? PluginMeta[plugin.name]?.client ?? "vencord";
}

export function ClientIcon({ client }: { client: PluginClient; }) {
    const { name, icon } = PluginClients[client];

    return (
        <Tooltip text={`Plugin from ${name}`}>
            {props => <img {...props} className={cl("client-icon")} src={icon} alt={name} draggable={false} />}
        </Tooltip>
    );
}

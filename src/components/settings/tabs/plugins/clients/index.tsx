/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { PluginClient } from "@utils/types";
import { Tooltip } from "@webpack/common";
import equicordIcon from "file://equicord.png?base64";
import nightcordIcon from "file://nightcord.png?base64";
import sudocordIcon from "file://sudocord.png?base64";
import vencordIcon from "file://vencord.png?base64";

import { PluginMeta } from "~plugins";

const cl = classNameFactory("vc-plugins-");

const png = (base64: string) => `data:image/png;base64,${base64}`;

export const PluginClients: Record<PluginClient, { name: string; icon: string; }> = {
    sudocord: { name: "SudoCord", icon: png(sudocordIcon) },
    vencord: { name: "Vencord", icon: png(vencordIcon) },
    equicord: { name: "Equicord", icon: png(equicordIcon) },
    nightcord: { name: "Nightcord", icon: png(nightcordIcon) },
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

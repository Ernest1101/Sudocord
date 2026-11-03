/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// @ts-nocheck -- ported from Nightcord, typed against Equicord's discord-types

import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { Card } from "@components/Card";
import { Flex, FlexAlign, FlexJustify } from "@components/Flex";
import { t } from "@nightcordplugins/autoTranslateNightcord";
import definePlugin, { OptionType } from "@utils/types";
import {
    Button,
    React,
    showToast,
    Text,
    Toasts,
    UserStore
} from "@webpack/common";

const CSS_ID = "nightcord-lightcord-css";

const settings = definePluginSettings({
    disableBadges: {
        type: OptionType.BOOLEAN,
        description: "Hides badges on user profiles, cards, chat messages, and member lists.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableActivities: {
        type: OptionType.BOOLEAN,
        description: "Hides playing, listening, streaming, voice status, and rich presence activities across member lists and profiles.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableNametags: {
        type: OptionType.BOOLEAN,
        description: "Hides clan tags, guild badges, discriminator tags, and nameplate chips next to usernames.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableGuildOnProfile: {
        type: OptionType.BOOLEAN,
        description: "Hides clan, guild chips, and guild badges on user profiles.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableNameplates: {
        type: OptionType.BOOLEAN,
        description: "Removes nameplate frames and collectible backgrounds on member lists and profiles.",
        default: true,
        restartNeeded: true,
        onChange() { updateCssIfRunning(); }
    },
    disableProfileEffects: {
        type: OptionType.BOOLEAN,
        description: "Removes avatar decorations, profile animation effects, and banner video effects.",
        default: true,
        restartNeeded: true,
        onChange() { updateCssIfRunning(); }
    },
    disableProfileThemes: {
        type: OptionType.BOOLEAN,
        description: "Neutralizes custom Nitro profile theme colors and gradients back to standard Discord dark/light theme.",
        default: true,
        restartNeeded: true,
        onChange() { updateCssIfRunning(); }
    },
    disableRoleColors: {
        type: OptionType.BOOLEAN,
        description: "Removes server role colors from usernames, restoring clean default high-contrast text.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableUsernameStyling: {
        type: OptionType.BOOLEAN,
        description: "Removes custom nickname glows, text-shadows, and special font styling.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableStatusIndicatorOnProfile: {
        type: OptionType.BOOLEAN,
        description: "Removes status indicator circles (Online, DND, Idle, Offline) on user profiles.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableActiveNowSidebar: {
        type: OptionType.BOOLEAN,
        description: "Hides the Active Now activity column on the right side of the friends list.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableDiscoveryButton: {
        type: OptionType.BOOLEAN,
        description: "Removes the Server Discovery compass button from the server list sidebar.",
        default: true,
        restartNeeded: true,
        onChange() { updateCssIfRunning(); }
    },
    disableQuestsAndShop: {
        type: OptionType.BOOLEAN,
        description: "Removes Quests, Shop, and Nitro tabs from the direct messages sidebar and hides quest popups.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableChatSlop: {
        type: OptionType.BOOLEAN,
        description: "Removes the Nitro gift button and the App Launcher (Activities) button from the chat bar.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableReactionEffects: {
        type: OptionType.BOOLEAN,
        description: "Removes super reaction animations, glowing borders, and particle effects.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableVoiceEffects: {
        type: OptionType.BOOLEAN,
        description: "Hides soundboard wave animations and voice call graphic effects.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    },
    disableNitroUpsells: {
        type: OptionType.BOOLEAN,
        description: "Removes server boost bars, nitro promotions, and upsell banners.",
        default: true,
        restartNeeded: false,
        onChange() { updateCssIfRunning(); }
    }
});

let isRunning = false;

function buildCss(): string {
    const rules: string[] = [];

    // 1. Badges
    if (settings.store.disableBadges) {
        rules.push(`
/* Lightcord: Badges */
[class*="badges-"],
[class*="badgeList-"],
[class*="profileBadges"],
[class*="badgeList_"],
[class*="badgeList"],
[class*="badges_"],
[class*="badgeContainer-"],
div[aria-label*="User Badges" i],
div[aria-label*="Badges de profil" i],
div[aria-label*="Badges de" i],
div[aria-label*="Badges" i],
[class*="member-"] [class*="badges-"],
[class*="member-"] [class*="badgeList-"],
.vc-sbic-badge {
    display: none !important;
}
`);
    }

    // 2. Activities on people (member list, voice channels, and user profile activity / song shelf)
    if (settings.store.disableActivities) {
        rules.push(`
/* Lightcord: Member Activities and Profile Activity Shelf */
[class*="activity-"],
[class*="activityText-"],
[class*="activityUserPopout-"],
[class*="userProfileActivity-"],
[class*="userProfileActivity"],
[class*="activityProfile-"],
[class*="activitySection-"],
[class*="userProfileActivityContainer-"],
[class*="tabBar-"]:has([id*="activity"]),
[class*="tabBarItem-"][id*="activity"],
[class*="tabBarItem-"][id*="song"],
[class*="tabBarItem-"][id*="wishlist"],
[class*="tabBar-"]:has([id*="song"]),
[class*="activityCard-"],
[class*="hangStatus-"],
[class*="voiceUser-"] [class*="activity-"],
[class*="voiceUser-"] [class*="activityText-"],
[class*="member-"] [class*="subText-"]:has([class*="activity-"]),
[class*="member-"] [class*="subText-"]:has(svg[class*="icon-"]),
[class*="channel-"] [class*="subText-"]:has([class*="activity-"]),
[class*="channel-"] [class*="activityText-"],
[class*="profilePanel-"] [class*="activity-"],
[class*="userProfile"] [class*="activity-"],
[class*="userPopout"] [class*="activity-"] {
    display: none !important;
}
`);
    }

    // 3. Nametags / Clan tags / Discriminators
    if (settings.store.disableNametags) {
        rules.push(`
/* Lightcord: Nametags and Clan tags */
[class*="clanTag-"],
[class*="clanTagChip-"],
[class*="userTagClan-"],
[class*="clanTagContainer-"],
span:has(> [class*="clanTag-"]),
[class*="discriminator-"],
[class*="userTagDiscriminator-"],
[class*="headerTag-"] [class*="discriminator-"] {
    display: none !important;
}
`);
    }

    // 4. Guild / Clan chips on profile
    if (settings.store.disableGuildOnProfile) {
        rules.push(`
/* Lightcord: Guild & Clan info on Profile */
[class*="profileClan-"],
[class*="guildBadge-"],
[class*="clanBadge-"],
[class*="userProfile"] [class*="tags-"],
[class*="userPopout"] [class*="tags-"],
[class*="userProfile"] [class*="badgeContainer-"],
[class*="userPopout"] [class*="badgeContainer-"],
[class*="userProfile"] [class*="clanTag-"],
[class*="userPopout"] [class*="clanTag-"] {
    display: none !important;
}
`);
    }

    // 5. Nameplates & Collectible frames (like on screen 2)
    if (settings.store.disableNameplates) {
        rules.push(`
/* Lightcord: Nameplates & Profile Frames on Member List */
[class*="nameplate"],
[class*="nameplate-"],
[class*="nameplateContainer"],
[class*="nameplateWrapper"],
img[src*="nameplates"],
[style*="nameplates"],
[class*="member-"] [class*="nameplate"],
[class*="member-"] img[src*="nameplates"],
[class*="member-"] [style*="nameplates"],
[class*="member-"] div:has(> img[src*="nameplates"]),
[class*="userProfile"] [class*="nameplate"],
[class*="voiceUser-"] [class*="nameplate"] {
    display: none !important;
    background: none !important;
    background-image: none !important;
    border: none !important;
    box-shadow: none !important;
}
[class*="member-"]:has([class*="nameplate"]) [class*="layout-"],
[class*="member-"]:has(img[src*="nameplates"]) [class*="layout-"] {
    background: transparent !important;
    background-image: none !important;
}
`);
    }

    // 6. Profile Effects, Avatar Decorations, Banner Effects
    if (settings.store.disableProfileEffects) {
        rules.push(`
/* Lightcord: Profile Effects, Avatar Decorations, Banner Animations */
[class*="avatarDecoration-"],
svg[class*="avatarDecoration-"],
img[class*="avatarDecoration-"],
[class*="avatarDecorationHint-"],
[class*="avatarStack-"] > [class*="avatarDecoration-"],
[class*="profileEffects-"],
[class*="profileEffectBackground-"],
[class*="profileEffect-"],
canvas[class*="profileEffect"],
[class*="animationWrapper-"] > [class*="profileEffect-"],
[class*="bannerEffects-"],
[class*="profileBanner-"] video,
[class*="profileBanner-"] img[src*="effects"],
div:has(> [class*="profileEffectBackground-"]) {
    display: none !important;
}
`);
    }

    // 7. Profile Themes (Custom Nitro Colors & Gradients)
    if (settings.store.disableProfileThemes) {
        rules.push(`
/* Lightcord: Neutralize Profile Theme Colors */
[class*="userProfileOuterThemed-"],
[class*="userProfileInnerThemed-"],
[class*="userProfile-"],
[class*="userPopout-"],
[class*="profileCard-"],
[class*="userProfileModal-"] {
    --profile-gradient-primary-color: var(--background-floating, #18191c) !important;
    --profile-gradient-secondary-color: var(--background-floating, #18191c) !important;
    --profile-body-background-color: var(--background-secondary, #2b2d31) !important;
    --profile-avatar-border-color: var(--background-secondary, #2b2d31) !important;
    background: var(--background-floating, #18191c) !important;
}
[class*="userProfileInnerThemed-"],
[class*="inner-"][class*="themed-"] {
    background: var(--background-secondary, #2b2d31) !important;
}
`);
    }

    // 8. Role Colors on Usernames
    if (settings.store.disableRoleColors) {
        rules.push(`
/* Lightcord: Remove Role Colors on Usernames */
[class*="username-"],
[class*="userTag-"],
[class*="headerTag-"] [class*="username-"],
[class*="member-"] [class*="name-"],
[class*="member-"] [class*="username-"],
[class*="message-"] [class*="username-"],
[class*="userProfile"] [class*="username-"],
[class*="userProfile"] [class*="userTag-"],
[class*="userProfile"] [class*="nickname-"] {
    color: var(--header-primary, #ffffff) !important;
}
`);
    }

    // 9. Username Styling, Glows, and Shadows
    if (settings.store.disableUsernameStyling) {
        rules.push(`
/* Lightcord: Remove Nickname Glows and Styling */
[class*="username-"],
[class*="userTag-"],
[class*="nickname-"],
[class*="headerTag-"] {
    text-shadow: none !important;
    filter: none !important;
    -webkit-text-stroke: 0 !important;
}
`);
    }

    // 10. Status Indicator Circle on Profiles (Online, DND, Idle, Offline)
    if (settings.store.disableStatusIndicatorOnProfile) {
        rules.push(`
/* Lightcord: Remove Status Circle on User Profiles */
[class*="userProfile"] [class*="avatarWrapper"] svg > rect:not([width="100%"]),
[class*="userPopout"] [class*="avatarWrapper"] svg > rect:not([width="100%"]),
[class*="profileCard"] [class*="avatarWrapper"] svg > rect:not([width="100%"]),
[class*="userProfileModal"] [class*="avatarWrapper"] svg > rect:not([width="100%"]),
[class*="userProfile"] [class*="avatarWrapper"] rect[mask*="svg-mask-status-"],
[class*="userPopout"] [class*="avatarWrapper"] rect[mask*="svg-mask-status-"],
[class*="userProfile"] [class*="avatarWrapper"] [class*="status-"],
[class*="userPopout"] [class*="avatarWrapper"] [class*="status-"],
[class*="userProfile"] [class*="avatarWrapper"] rect[fill*="status"],
[class*="userPopout"] [class*="avatarWrapper"] rect[fill*="status"],
[class*="userProfile"] [class*="avatarWrapper"] svg[class*="cursor-"] > rect,
[class*="userPopout"] [class*="avatarWrapper"] svg[class*="cursor-"] > rect {
    display: none !important;
}

/* Remove avatar cutout on profiles for an intact round avatar */
[class*="userProfile"] [class*="avatarWrapper"] svg foreignObject,
[class*="userPopout"] [class*="avatarWrapper"] svg foreignObject,
[class*="profileCard"] [class*="avatarWrapper"] svg foreignObject,
[class*="userProfileModal"] [class*="avatarWrapper"] svg foreignObject {
    mask: none !important;
    border-radius: 50% !important;
}
[class*="userProfile"] [class*="avatarWrapper"] img[class*="avatar-"],
[class*="userPopout"] [class*="avatarWrapper"] img[class*="avatar-"],
[class*="profileCard"] [class*="avatarWrapper"] img[class*="avatar-"],
[class*="userProfileModal"] [class*="avatarWrapper"] img[class*="avatar-"] {
    border-radius: 50% !important;
}
`);
    }

    // 11. Active Now Activity Sidebar (Right side of Friends tab)
    if (settings.store.disableActiveNowSidebar || settings.store.disableActivities) {
        rules.push(`
/* Lightcord: Active Now sidebar in Friends tab */
[class*="nowPlayingColumn"],
[class*="nowPlayingSidebar"],
aside[aria-label*="Active Now" i],
aside[aria-label*="En ligne actuellement" i],
aside[aria-label*="Actif" i],
aside:has([class*="nowPlayingColumn"]),
[class*="tabBody-"] > [class*="nowPlayingColumn"],
[class*="container-"] > [class*="nowPlayingColumn"],
[class*="peopleColumn-"] + [class*="nowPlayingColumn"] {
    display: none !important;
    width: 0 !important;
    min-width: 0 !important;
    max-width: 0 !important;
    flex-basis: 0 !important;
}
[class*="peopleColumn"] {
    width: 100% !important;
    max-width: 100% !important;
    flex: 1 1 auto !important;
}
`);
    }

    // 12. Server Discovery Button (Compass icon in server list)
    if (settings.store.disableDiscoveryButton || settings.store.disableQuestsAndShop) {
        rules.push(`
/* Lightcord: Server Discovery button in Guild list */
[class*="listItem"]:has([data-list-item-id*="discover"]),
[class*="listItem"]:has([data-list-item-id*="guild-discover-button"]),
[class*="listItem"]:has(a[href="/discovery"]),
[class*="listItem"]:has(svg path[d*="M7.74 9.3"]),
[data-list-id="guildsnav"] [class*="footer"],
[data-list-id="guildsnav"] [data-list-item-id="guildsnav___guild-discover-button"],
[data-list-id="guildsnav"] [class*="guild-discover-button"],
[class*="guild-discover-button"],
[class*="guildDiscoveryButton"] {
    display: none !important;
}
[class*="unreadMentionsFixedFooter"] {
    bottom: 0px !important;
}
`);
    }

    // 11. Quests, Shop, Nitro Home
    if (settings.store.disableQuestsAndShop) {
        rules.push(`
/* Lightcord: Quests, Shop, Nitro Home */
li:has(a[href="/shop"]),
a[href="/shop"],
[data-list-item-id*="shop"],
[data-list-item-id*="discord-shop"],
li:has(a[href="/nitro"]),
a[href="/nitro"],
[data-list-item-id*="nitro"],
li:has(a[href="/quest-home"]),
a[href="/quest-home"],
[data-list-item-id*="quests"],
[data-list-item-id*="quest-home"],
li:has(a[href="/discovery"]),
a[href="/discovery"],
[class*="questBar-"],
[class*="questBarWrapper-"],
[class*="questProgress-"],
[class*="questsCard-"],
[class*="questCard-"],
[class*="questDeliveryContainer-"],
[class*="questNotice-"],
div:has(> [class*="questBar-"]) {
    display: none !important;
}
`);
    }

    // 12. Chat Bar Slop (Gift button, App launcher)
    if (settings.store.disableChatSlop) {
        rules.push(`
/* Lightcord: Chat Bar Gift & App Launcher */
button[aria-label*="Gift" i],
button[aria-label*="Cadeau" i],
button[aria-label*="App Launcher" i],
button[aria-label*="Applications" i],
[class*="channelAppLauncher"],
[class*="channelTextArea-"] button:has(svg path[d*="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4V6Zm16 4H4v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8Z"]) {
    display: none !important;
}
`);
    }

    // 13. Super Reactions & Reaction Effects
    if (settings.store.disableReactionEffects) {
        rules.push(`
/* Lightcord: Super Reactions & Burst Glow */
[class*="burstGlow-"],
[class*="burstReaction-"],
[class*="effects-"],
[class*="burstEffect-"],
[class*="reactionInner-"][class*="burst-"]::before,
[class*="reactionInner-"][class*="burst-"]::after {
    display: none !important;
    animation: none !important;
}
`);
    }

    // 14. Voice Call & Soundboard Effects
    if (settings.store.disableVoiceEffects) {
        rules.push(`
/* Lightcord: Soundboard waves & animations */
[class*="soundboardWave-"],
[class*="wave-"][class*="soundboard"] {
    display: none !important;
}
`);
    }

    // 15. Nitro Upsells & Server Boost Bar
    if (settings.store.disableNitroUpsells) {
        rules.push(`
/* Lightcord: Nitro Upsells & Boost Bar */
[class*="boostBar-"],
[class*="serverBoostNotice-"],
[class*="premiumUpsell-"],
[class*="upsellBanner-"],
[class*="nitroUpsell-"],
[class*="tierUpsell-"] {
    display: none !important;
}
`);
    }

    return rules.join("\n");
}

function updateCssIfRunning() {
    if (!isRunning) return;
    const css = buildCss();
    let style = document.getElementById(CSS_ID) as HTMLStyleElement | null;
    if (!style) {
        style = document.createElement("style");
        style.id = CSS_ID;
        document.head?.appendChild(style);
    }
    style.textContent = css;
}

function removeCss() {
    const style = document.getElementById(CSS_ID);
    if (style) {
        style.remove();
    }
}

function LightcordSettingsAbout() {
    const handleEnableAll = () => {
        settings.store.disableBadges = true;
        settings.store.disableActivities = true;
        settings.store.disableNametags = true;
        settings.store.disableGuildOnProfile = true;
        settings.store.disableNameplates = true;
        settings.store.disableProfileEffects = true;
        settings.store.disableProfileThemes = true;
        settings.store.disableRoleColors = true;
        settings.store.disableUsernameStyling = true;
        settings.store.disableStatusIndicatorOnProfile = true;
        settings.store.disableActiveNowSidebar = true;
        settings.store.disableDiscoveryButton = true;
        settings.store.disableQuestsAndShop = true;
        settings.store.disableChatSlop = true;
        settings.store.disableReactionEffects = true;
        settings.store.disableVoiceEffects = true;
        settings.store.disableNitroUpsells = true;
        updateCssIfRunning();
        showToast(t("All Lightcord optimizations enabled"), Toasts.Type.SUCCESS);
    };

    const handleRestoreDefaults = () => {
        settings.store.disableBadges = true;
        settings.store.disableActivities = true;
        settings.store.disableNametags = true;
        settings.store.disableGuildOnProfile = true;
        settings.store.disableNameplates = true;
        settings.store.disableProfileEffects = true;
        settings.store.disableProfileThemes = true;
        settings.store.disableRoleColors = true;
        settings.store.disableUsernameStyling = true;
        settings.store.disableStatusIndicatorOnProfile = true;
        settings.store.disableActiveNowSidebar = true;
        settings.store.disableDiscoveryButton = true;
        settings.store.disableQuestsAndShop = true;
        settings.store.disableChatSlop = true;
        settings.store.disableReactionEffects = true;
        settings.store.disableVoiceEffects = true;
        settings.store.disableNitroUpsells = true;
        updateCssIfRunning();
        showToast(t("Lightcord settings restored to default"), Toasts.Type.SUCCESS);
    };

    return (
        <Card style={{ padding: "16px 20px", backgroundColor: "var(--background-secondary)", borderRadius: 8, marginBottom: 16 }}>
            <Flex justify={FlexJustify.BETWEEN} align={FlexAlign.CENTER} style={{ gap: 16 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                    <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: "var(--background-floating)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2Z"
                                stroke="var(--brand-500)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    <div>
                        <Text variant="text-md/bold" style={{ color: "var(--header-primary)", marginBottom: 4 }}>
                            {t("Lightcord Mode Active")}
                        </Text>
                        <Text variant="text-sm/normal" style={{ color: "var(--text-muted)", lineHeight: "18px" }}>
                            {t("All bloat, badges, activities, and visual slop are stripped from Discord.")}
                        </Text>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={Button.Colors.BRAND}
                        onClick={handleEnableAll}
                    >
                        {t("Enable All Optimizations")}
                    </Button>
                    <Button
                        size={Button.Sizes.SMALL}
                        color={Button.Colors.PRIMARY}
                        onClick={handleRestoreDefaults}
                    >
                        {t("Restore Defaults")}
                    </Button>
                </div>
            </Flex>
        </Card>
    );
}

export default definePlugin({
    name: "Lightcord",
    description: "Lightweight Discord experience: removes badges, member activities, nametags, Discord slop (Quests, Shop, Nitro Home), profile effects, avatar decorations, and bloat animations.",
    authors: [
        { name: "Nightcord", id: 0n }
    ],
    enabledByDefault: false,
    settings,
    settingsAboutComponent: LightcordSettingsAbout,

    patches: [
        {
            // Nameplate component (frames on member list items and profiles)
            find: ".MINI_PREVIEW,[",
            replacement: {
                match: /function \i\((\i)\)\{(?=let.{1,5}\{nameplate:\i,)/,
                replace: '$&if($1.placement!=="preview"&&$1.placement!=="mini_preview")return null;',
            },
            predicate: () => settings.store.disableNameplates,
        },
        {
            // Remove profile theme colors for all other users
            find: "hasThemeColors(){",
            replacement: {
                match: /get canUsePremiumProfileCustomization\(\){return /,
                replace: "$&$self.isCurrentUser(this?.userId)&&"
            },
            predicate: () => settings.store.disableProfileThemes,
        },
        {
            // Profile banner animation effect
            find: "bannerAdjustment,isHovering",
            replacement: {
                match: /\i=function\((\i)\)\{(?=.{0,50}\.useReducedMotion\))/,
                replace: "$&if(!$1.shopPreview)return null;",
            },
            predicate: () => settings.store.disableProfileEffects,
        },
        {
            // Avatar decoration
            find: "isAvatarDecorationAnimating:",
            replacement: {
                match: /(?<=\{avatarDecoration:.{0,40}?)(void 0!==\i\?\i:)\i(?=\)?,canAnimate:)/,
                replace: "$1null",
            },
            predicate: () => settings.store.disableProfileEffects && !isPluginEnabled("Decor"),
        },
        {
            // Server Discovery button in guild list
            find: '("guildsnav")',
            replacement: {
                match: /(guildDiscoveryButton:)\i/g,
                replace: "$1null",
            },
            predicate: () => settings.store.disableDiscoveryButton,
        },
    ],

    isCurrentUser: (userId?: string) => userId === UserStore.getCurrentUser()?.id,

    start() {
        isRunning = true;
        updateCssIfRunning();
    },

    stop() {
        isRunning = false;
        removeCss();
    }
});

/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { t } from "@nightcordplugins/autoTranslateNightcord";
import { openPrivateChannel } from "@utils/discord";
import definePlugin from "@utils/types";
import {
    ChannelActionCreators,
    ChannelStore,
    createRoot,
    NavigationRouter,
    React,
    Tooltip,
    UserStore
} from "@webpack/common";

const mountedRoots = new Map<HTMLElement, ReturnType<typeof createRoot>>();
let observer: MutationObserver | null = null;

async function triggerDM(userId: string) {
    if (!userId) return;

    // Dismiss popout
    try {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    } catch {}

    try {
        const existingDmId = ChannelStore?.getDMFromUserId?.(userId);
        if (existingDmId) {
            NavigationRouter?.transitionTo?.(`/channels/@me/${existingDmId}`);
            return;
        }

        if (typeof ChannelActionCreators?.openPrivateChannel === "function") {
            await ChannelActionCreators.openPrivateChannel({
                recipientIds: [userId],
                navigateToChannel: true
            });
            return;
        }
    } catch (err) {
        console.warn("[QuickDM] Error opening private channel with object:", err);
    }

    try {
        if (typeof ChannelActionCreators?.openPrivateChannel === "function") {
            await ChannelActionCreators.openPrivateChannel([userId]);
            return;
        }
    } catch {}

    try {
        openPrivateChannel(userId);
    } catch {}
}

function QuickDMButton({ userId, siblingClass }: { userId: string; siblingClass: string; }) {
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        triggerDM(userId);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            triggerDM(userId);
        }
    };

    // Combine exact native bannerButton classes from Discord
    const combinedClass = [
        "bannerButton_fb7f94",
        siblingClass,
        "nc-quick-dm-button"
    ]
        .filter(Boolean)
        .join(" ")
        .split(" ")
        .filter((c, i, a) => a.indexOf(c) === i)
        .join(" ");

    return (
        <Tooltip text={t("Direct Message")} position="top">
            {(tooltipProps: Record<string, any>) => (
                <div
                    {...tooltipProps}
                    className={combinedClass}
                    aria-label={t("Direct Message")}
                    aria-disabled="false"
                    aria-busy="false"
                    role="button"
                    tabIndex={0}
                    onClick={e => {
                        tooltipProps?.onClick?.(e);
                        handleClick(e);
                    }}
                    onKeyDown={e => {
                        tooltipProps?.onKeyDown?.(e);
                        handleKeyDown(e);
                    }}
                >
                    <svg
                        className="icon_a22cb0"
                        aria-hidden="true"
                        role="img"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <path
                            fill="currentColor"
                            d="M12 22a10 10 0 1 0-8.45-4.64c.13.19.11.44-.04.61l-2.06 2.37A1 1 0 0 0 2.2 22H12Z"
                        />
                    </svg>
                </div>
            )}
        </Tooltip>
    );
}

function extractUserIdFromFiber(el: Element | null): string | null {
    if (!el) return null;
    try {
        const fiberKey = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (!fiberKey) return null;
        let fiber = (el as any)[fiberKey];
        for (let i = 0; i < 45 && fiber; i++) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props) {
                if (props.user?.id && /^\d{17,20}$/.test(String(props.user.id))) return String(props.user.id);
                if (props.displayProfile?.userId && /^\d{17,20}$/.test(String(props.displayProfile.userId))) return String(props.displayProfile.userId);
                if (props.profile?.userId && /^\d{17,20}$/.test(String(props.profile.userId))) return String(props.profile.userId);
                if (props.member?.userId && /^\d{17,20}$/.test(String(props.member.userId))) return String(props.member.userId);
                if (props.member?.user?.id && /^\d{17,20}$/.test(String(props.member.user.id))) return String(props.member.user.id);
                if (props.author?.id && /^\d{17,20}$/.test(String(props.author.id))) return String(props.author.id);
                if (typeof props.userId === "string" && /^\d{17,20}$/.test(props.userId)) return props.userId;
            }
            fiber = fiber.return;
        }
    } catch {}
    return null;
}

function getPopoutUserId(popout: HTMLElement): string | null {
    const avatar = popout.querySelector<HTMLElement>("[class*='avatar_'], [class*='avatarStack_'], [class*='wrapper_'][role='img']");
    if (avatar) {
        const aid = extractUserIdFromFiber(avatar);
        if (aid) return aid;
    }

    const header = popout.querySelector<HTMLElement>("[class*='header_']");
    if (header) {
        const hid = extractUserIdFromFiber(header);
        if (hid) return hid;
    }

    const fiberId = extractUserIdFromFiber(popout);
    if (fiberId) return fiberId;

    const avatarImg = popout.querySelector<HTMLImageElement>("img[src*='/avatars/']");
    if (avatarImg) {
        const match = avatarImg.src.match(/\/avatars\/(\d{17,20})\//);
        if (match) return match[1];
    }

    return null;
}

function injectQuickDMButton(popout: HTMLElement) {
    if (popout.querySelector(".nc-quick-dm-button-wrapper")) return;

    let wrapper = popout.querySelector<HTMLElement>("[class*='inner_'] > [class*='wrapper_']");
    if (!wrapper) {
        const bannerBtn = popout.querySelector("[class*='bannerButton_']");
        if (bannerBtn) {
            const span = bannerBtn.closest("span");
            if (span && span.parentElement) {
                wrapper = span.parentElement;
            } else {
                const overflow = bannerBtn.closest("[class*='overflowButtonContainer_']");
                if (overflow && overflow.parentElement) wrapper = overflow.parentElement;
            }
        }
    }
    if (!wrapper) return;

    const userId = getPopoutUserId(popout);
    if (!userId) return;

    const currentUserId = UserStore?.getCurrentUser?.()?.id;
    if (userId === currentUserId) return;

    const siblingBtn = wrapper.querySelector<HTMLElement>("[class*='bannerButton_']");
    let btnClass = "";
    if (siblingBtn) {
        const classes = Array.from(siblingBtn.classList).filter(c => !c.startsWith("nc-"));
        btnClass = classes.join(" ");
    }

    const span = document.createElement("span");
    span.className = "nc-quick-dm-button-wrapper";

    if (wrapper.firstChild) {
        wrapper.insertBefore(span, wrapper.firstChild);
    } else {
        wrapper.appendChild(span);
    }

    if (typeof createRoot === "function") {
        try {
            const root = createRoot(span);
            mountedRoots.set(span, root);
            root.render(<QuickDMButton userId={userId} siblingClass={btnClass} />);
        } catch (err) {
            console.error("[QuickDM] Error rendering QuickDMButton root:", err);
        }
    }
}

function cleanupDisconnectedRoots() {
    for (const [spanEl, r] of mountedRoots.entries()) {
        if (!document.body.contains(spanEl)) {
            try { r.unmount(); } catch {}
            mountedRoots.delete(spanEl);
        }
    }
}

function scanPopouts() {
    cleanupDisconnectedRoots();
    const popouts = document.querySelectorAll<HTMLElement>(
        "[class*='user-profile-popout'], [class*='userPopout'], .user-profile-popout, [class*='biteSize_'], [class*='outer_'][class*='themeContainer_']"
    );
    for (const popout of Array.from(popouts)) {
        injectQuickDMButton(popout);
    }
}

let _scanDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedScanPopouts() {
    if (_scanDebounceTimer !== null) return;
    _scanDebounceTimer = setTimeout(() => {
        _scanDebounceTimer = null;
        scanPopouts();
    }, 120);
}

export default definePlugin({
    name: "QuickDM",
    description: "Adds a quick DM button to user profile popouts to open direct messages instantly.",
    authors: [
        {
            name: "Nightcord",
            id: 1539701501679894678n
        }
    ],

    start() {
        debouncedScanPopouts();
        observer = new MutationObserver(mutations => {
            let relevant = false;
            for (const m of mutations) {
                const target = m.target as HTMLElement;
                if (!target) continue;
                if (target.closest?.("[class*='userProfile'], [class*='userPopout'], [class*='biteSize_'], [id^='popout_']")) {
                    relevant = true;
                    break;
                }
                for (const node of m.addedNodes) {
                    if (node instanceof HTMLElement && (node.matches?.("[class*='userProfile'], [class*='userPopout'], [class*='biteSize_'], [id^='popout_']") || node.querySelector?.("[class*='userPopout'], [class*='biteSize_']"))) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }
            if (relevant) {
                debouncedScanPopouts();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    },

    stop() {
        if (_scanDebounceTimer !== null) {
            clearTimeout(_scanDebounceTimer);
            _scanDebounceTimer = null;
        }
        observer?.disconnect();
        observer = null;
        for (const [spanEl, r] of mountedRoots.entries()) {
            try { r.unmount(); } catch {}
            spanEl.remove();
        }
        mountedRoots.clear();
        const buttons = document.querySelectorAll(".nc-quick-dm-button-wrapper");
        for (const btn of Array.from(buttons)) {
            btn.remove();
        }
    }
});

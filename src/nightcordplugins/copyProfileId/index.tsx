/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { t } from "@nightcordplugins/autoTranslateNightcord";
import { copyToClipboard } from "@utils/clipboard";
import definePlugin from "@utils/types";
import {
    createRoot,
    React,
    showToast,
    Toasts,
    Tooltip
} from "@webpack/common";

const mountedRoots = new Map<HTMLElement, ReturnType<typeof createRoot>>();
let observer: MutationObserver | null = null;

function CopyProfileIdButton({
    userId,
    buttonClass,
    buttonStyle,
    wrapperClass,
    childrenClass
}: {
    userId: string;
    buttonClass: string;
    buttonStyle?: string;
    wrapperClass: string;
    childrenClass: string;
}) {
    const btnRef = React.useRef<HTMLButtonElement>(null);

    React.useEffect(() => {
        if (btnRef.current && buttonStyle) {
            btnRef.current.style.cssText = buttonStyle;
        }
    }, [buttonStyle]);

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        copyToClipboard(userId);
        showToast(t("User ID copied to clipboard!"), Toasts.Type.SUCCESS);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(userId);
            showToast(t("User ID copied to clipboard!"), Toasts.Type.SUCCESS);
        }
    };

    const cleanBtnClass = buttonClass.replace(/\bhasText_[a-zA-Z0-9]+\b/g, "").trim();
    const combinedBtnClass = [
        cleanBtnClass,
        "nc-copy-profile-id-button"
    ]
        .filter(Boolean)
        .join(" ")
        .split(" ")
        .filter((c, i, a) => a.indexOf(c) === i)
        .join(" ");

    const label = t("Copy User ID");

    return (
        <Tooltip text={label} position="top" aria-label={label}>
            {(tooltipProps: Record<string, any>) => (
                <button
                    {...tooltipProps}
                    ref={(node: HTMLButtonElement | null) => {
                        (btnRef as any).current = node;
                        if (node && buttonStyle) {
                            node.style.cssText = buttonStyle;
                        }
                        if (typeof tooltipProps?.ref === "function") {
                            tooltipProps.ref(node);
                        } else if (tooltipProps?.ref && typeof tooltipProps.ref === "object") {
                            tooltipProps.ref.current = node;
                        }
                    }}
                    data-mana-component="button"
                    role="button"
                    className={combinedBtnClass}
                    type="button"
                    aria-label={label}
                    onClick={e => {
                        tooltipProps?.onClick?.(e);
                        handleClick(e);
                    }}
                    onKeyDown={e => {
                        tooltipProps?.onKeyDown?.(e);
                        handleKeyDown(e);
                    }}
                >
                    <div className={wrapperClass}>
                        <div className={childrenClass}>
                            <svg
                                className="icon_a22cb0 vc-ic-save-icon"
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
                                    d="M16.32 14.72a1 1 0 0 1 0-1.41l2.51-2.51a3.98 3.98 0 0 0-5.62-5.63l-2.52 2.51a1 1 0 0 1-1.41-1.41l2.52-2.52a5.98 5.98 0 0 1 8.45 8.46l-2.52 2.51a1 1 0 0 1-1.41 0ZM7.68 9.29a1 1 0 0 1 0 1.41l-2.52 2.51a3.98 3.98 0 1 0 5.63 5.63l2.51-2.52a1 1 0 0 1 1.42 1.42l-2.52 2.51a5.98 5.98 0 0 1-8.45-8.45l2.51-2.51a1 1 0 0 1 1.42 0Z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M14.7 10.7a1 1 0 0 0-1.4-1.4l-4 4a1 1 0 1 0 1.4 1.4l4-4Z"
                                />
                            </svg>
                        </div>
                    </div>
                </button>
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
        for (let i = 0; i < 60 && fiber; i++) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props) {
                if (props.user?.id && /^\d{17,20}$/.test(String(props.user.id))) return String(props.user.id);
                if (props.currentUser?.id && /^\d{17,20}$/.test(String(props.currentUser.id))) return String(props.currentUser.id);
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

function getPopoutUserId(container: HTMLElement): string | null {
    // 1. Check fiber on container itself
    let id = extractUserIdFromFiber(container);
    if (id) return id;

    // 2. Check child buttons fiber
    const buttons = container.querySelectorAll("button");
    for (const btn of Array.from(buttons)) {
        id = extractUserIdFromFiber(btn);
        if (id) return id;
    }

    // 3. Find closest popout/modal/body root
    const root = container.closest<HTMLElement>(
        "[class*='userProfile_'], [class*='userPopout_'], [class*='biteSize_'], [class*='fullSize_'], [class*='modal_'], [class*='profileBody_'], [role='dialog'], [class*='themeContainer_'], [class*='root_']"
    ) || container.parentElement?.parentElement;

    if (root) {
        id = extractUserIdFromFiber(root);
        if (id) return id;

        const avatar = root.querySelector<HTMLElement>("[class*='avatar_'], [class*='avatarStack_'], [class*='wrapper_'][role='img']");
        if (avatar) {
            id = extractUserIdFromFiber(avatar);
            if (id) return id;
        }

        const header = root.querySelector<HTMLElement>("[class*='header_']");
        if (header) {
            id = extractUserIdFromFiber(header);
            if (id) return id;
        }

        const avatarImg = root.querySelector<HTMLImageElement>("img[src*='/avatars/']");
        if (avatarImg) {
            const match = avatarImg.src.match(/\/avatars\/(\d{17,20})\//);
            if (match) return match[1];
        }
    }

    const globalAvatar = document.querySelector<HTMLImageElement>(
        "[role='dialog'] img[src*='/avatars/'], [class*='themeContainer_'] img[src*='/avatars/'], [class*='userProfile_'] img[src*='/avatars/']"
    );
    if (globalAvatar) {
        const match = globalAvatar.src.match(/\/avatars\/(\d{17,20})\//);
        if (match) return match[1];
    }

    return null;
}

function injectCopyIdButton(profileButtons: HTMLElement) {
    if (profileButtons.querySelector(".nc-copy-profile-id-wrapper")) return;

    const userId = getPopoutUserId(profileButtons);
    if (!userId) return;

    const buttons = Array.from(profileButtons.querySelectorAll<HTMLButtonElement>("button"));
    let messageBtn = buttons.find(b => {
        const label = b.getAttribute("aria-label")?.toLowerCase() || "";
        return label.includes("message") || label.includes("envoyer");
    });
    if (!messageBtn) {
        messageBtn = buttons.find(b => b.querySelector("svg path[d*='12 22a10'], svg path[d*='M12 22']"));
    }
    if (!messageBtn && buttons.length >= 2) {
        messageBtn = buttons[1];
    }

    // Target the 3 dots / more button, or any secondary button to match its exact style and theme
    const moreBtn = buttons.find(b =>
        b.getAttribute("aria-haspopup") === "menu" ||
        b.getAttribute("aria-label")?.toLowerCase().includes("more") ||
        b.getAttribute("aria-label")?.toLowerCase().includes("plus") ||
        b.querySelector("svg path[d*='M4 12'], svg path[d*='4 14a2'], svg path[d*='M12 14a2']")
    ) || buttons.find(b => !b.className.includes("primary")) || buttons[buttons.length - 1];

    const templateBtn = moreBtn ?? buttons[buttons.length - 1] ?? buttons[0];
    let btnClass = templateBtn?.className || "button_a22cb0 sm_a22cb0 secondary_a22cb0";
    // Always use secondary button styling matching the 3 dots button, never primary
    btnClass = btnClass.replace(/\bprimary_[a-zA-Z0-9]+\b/g, "secondary_a22cb0");
    btnClass = btnClass.replace(/\bhasText_[a-zA-Z0-9]+\b/g, "");
    if (!btnClass.includes("secondary_")) {
        btnClass += " secondary_a22cb0";
    }

    const wrapperClass = templateBtn?.querySelector("[class*='buttonChildrenWrapper_']")?.className || "buttonChildrenWrapper_a22cb0";
    const childrenClass = templateBtn?.querySelector("[class*='buttonChildren_']")?.className || "buttonChildren_a22cb0";
    const buttonStyle = templateBtn?.getAttribute("style") || undefined;

    const span = document.createElement("span");
    span.className = "nc-copy-profile-id-wrapper";

    if (messageBtn) {
        const targetEl = messageBtn.closest("span") ?? messageBtn;
        targetEl.insertAdjacentElement("afterend", span);
    } else if (buttons.length > 0) {
        buttons[0].insertAdjacentElement("afterend", span);
    } else {
        profileButtons.appendChild(span);
    }

    if (typeof createRoot === "function") {
        try {
            const root = createRoot(span);
            mountedRoots.set(span, root);
            root.render(
                <CopyProfileIdButton
                    userId={userId}
                    buttonClass={btnClass}
                    buttonStyle={buttonStyle}
                    wrapperClass={wrapperClass}
                    childrenClass={childrenClass}
                />
            );
        } catch (err) {
            console.error("[CopyProfileId] Error rendering button root:", err);
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

function scanProfileButtons() {
    cleanupDisconnectedRoots();
    const buttonContainers = document.querySelectorAll<HTMLElement>(
        "[class*='profileButtons_'], .profileButtons__9c3be"
    );
    for (const container of Array.from(buttonContainers)) {
        injectCopyIdButton(container);
    }
}

let _scanDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedScanProfileButtons() {
    if (_scanDebounceTimer !== null) return;
    _scanDebounceTimer = setTimeout(() => {
        _scanDebounceTimer = null;
        scanProfileButtons();
    }, 120);
}

export default definePlugin({
    name: "CopyProfileId",
    description: "Adds a button next to the Message button in user profile popouts to quickly copy the user ID.",
    authors: [
        {
            name: "Nightcord",
            id: 1539701501679894678n
        }
    ],

    start() {
        debouncedScanProfileButtons();
        observer = new MutationObserver(mutations => {
            let relevant = false;
            for (const m of mutations) {
                const target = m.target as HTMLElement;
                if (!target) continue;
                if (target.closest?.("[class*='userProfile'], [class*='userPopout'], [class*='biteSize_'], [class*='profileButtons_'], [id^='popout_']")) {
                    relevant = true;
                    break;
                }
                for (const node of m.addedNodes) {
                    if (node instanceof HTMLElement && (node.matches?.("[class*='userProfile'], [class*='userPopout'], [class*='biteSize_'], [class*='profileButtons_'], [id^='popout_']") || node.querySelector?.("[class*='profileButtons_'], .profileButtons__9c3be"))) {
                        relevant = true;
                        break;
                    }
                }
                if (relevant) break;
            }
            if (relevant) {
                debouncedScanProfileButtons();
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
        const buttons = document.querySelectorAll(".nc-copy-profile-id-wrapper");
        for (const btn of Array.from(buttons)) {
            btn.remove();
        }
    }
});

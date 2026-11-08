/*
 * SudoCord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import type { ComponentType } from "react";

export interface ProfileSectionProps {
    userId: string;
    isSideBar: boolean;
}

const sections = new Map<string, ComponentType<ProfileSectionProps>>();

/** Adds a section next to "Member Since" in user profiles (DM sidebar and profile modal). */
export function addProfileSection(id: string, component: ComponentType<ProfileSectionProps>) {
    sections.set(id, ErrorBoundary.wrap(component, { noop: true }));
}

export function removeProfileSection(id: string) {
    sections.delete(id);
}

/** @internal Injected by ProfileSectionsAPI patch (do NOT call directly) */
export function renderProfileSections(props: ProfileSectionProps) {
    if (!sections.size) return null;
    return [...sections].map(([id, Section]) => <Section key={id} {...props} />);
}

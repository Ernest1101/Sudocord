import type { ReactNode } from "react";

export interface NavItem {
    text: string
    href: string
    external?: boolean
}

export interface BrowseItem {
    icon: () => ReactNode
    text: string
    description: string
    href: string
    external?: boolean
}

export interface BrowseSection {
    category: string
    items: BrowseItem[]
}

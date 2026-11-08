import type { IconDefinition } from "@fortawesome/free-brands-svg-icons";

export interface Download {
    text: string
    href: string
    prioritize?: boolean
    note?: string
    /** same file on GitHub, shown as a small backup link under the button */
    githubHref?: string
}

export interface Platform {
    title: string
    icon: IconDefinition
    downloads: Download[]
    isCurrent: boolean
    warning?: string
    subtext?: string
    subsection?: Download[]
    command?: {
        label: string
        text: string
    }
}

export interface Section {
    title: string
    description: string
    githubUrl: string
    platforms: Platform[]
    globalWarning?: string
}

---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "SudoCord Docs"
  text: "Documentation for Discord's cutest client"
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started
    - theme: alt
      text: Installation
      link: /installation
    - theme: alt
      text: FAQ
      link: /faq

features:
  - title: Getting Started
    details: Learn how to set up and use SudoCord.
    link: /getting-started
  - title: Installation
    details: Step-by-step guide for installing SudoCord on Windows, Linux and macOS.
    link: /installation
  - title: Plugins
    details: Learn how SudoCord plugins work and how to install user plugins.
    link: /plugins
  - title: Plugin Development
    details: Learn to build your own custom plugins for SudoCord from scratch.
    link: /plugin-development
  - title: Plugin List
    details: Browse all built-in SudoCord plugins on the website.
    link: https://sudocord.h4ck.me/plugins
  - title: FAQ
    details: Find answers to common questions and troubleshooting tips.
    link: /faq
---
<!-- markdownlint-disable MD041 -->
<script setup lang="ts">
import { VPTeamMembers } from 'vitepress/theme'
const svgIcon = {svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m-11 5L21 3m-3 10v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>'}
const members = [
  {
    avatar: 'https://avatars.githubusercontent.com/u/Ernest1101',
    name: 'mrernestyt',
    title: 'Owner & Developer',
    links: [
      { icon: 'github', link: 'https://github.com/Ernest1101' },
      { icon: svgIcon, link: 'https://sudocord.h4ck.me' }
    ]
  },
]
</script>

<div style="margin-top: 48px;">
  <h2 style="text-align: center; font-size: 24px; font-weight: 600; margin-bottom: 24px;">The Team</h2>
  <VPTeamMembers size="small" :members="members" />
</div>

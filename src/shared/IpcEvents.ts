/*
 * SudoCord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export const enum IpcEvents {
    INIT_FILE_WATCHERS = "SudoCordInitFileWatchers",

    OPEN_QUICKCSS = "SudoCordOpenQuickCss",
    GET_QUICK_CSS = "SudoCordGetQuickCss",
    SET_QUICK_CSS = "SudoCordSetQuickCss",
    QUICK_CSS_UPDATE = "SudoCordQuickCssUpdate",

    GET_SETTINGS = "SudoCordGetSettings",
    SET_SETTINGS = "SudoCordSetSettings",

    GET_THEMES_LIST = "SudoCordGetThemesList",
    GET_THEME_DATA = "SudoCordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "SudoCordGetThemeSystemValues",
    THEME_UPDATE = "SudoCordThemeUpdate",

    OPEN_EXTERNAL = "SudoCordOpenExternal",
    OPEN_THEMES_FOLDER = "SudoCordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "SudoCordOpenSettingsFolder",

    GET_UPDATES = "SudoCordGetUpdates",
    GET_REPO = "SudoCordGetRepo",
    UPDATE = "SudoCordUpdate",
    BUILD = "SudoCordBuild",

    OPEN_MONACO_EDITOR = "SudoCordOpenMonacoEditor",
    GET_MONACO_THEME = "SudoCordGetMonacoTheme",

    GET_PLUGIN_IPC_METHOD_MAP = "SudoCordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "SudoCordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "SudoCordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "SudoCordCspRequestAddOverride",

    GET_RENDERER_CSS = "SudoCordGetRendererCss",
    RENDERER_CSS_UPDATE = "SudoCordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "SudoCordPreloadGetRendererJs",

    SUPPORTS_WINDOWS_MATERIAL = "SudoCordSupportsWindowsMaterial",

    FETCH_URL = "SudoCordFetchUrl",
}

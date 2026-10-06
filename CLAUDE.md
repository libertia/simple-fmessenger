# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Two independent Electron desktop wrappers built from one repo:

- **Messenger**: loads `https://facebook.com/messages`
- **Gather**: loads `https://app.gather.town/app`

Plain CommonJS JavaScript with no bundler, no TypeScript, no tests and no linter. The only dependencies are `electron` and `electron-builder` (dev).

## Commands

```sh
npm install
npm run start:messenger        # same as `npm start` (package.json "main" = apps/messenger.js)
npm run start:gather           # electron apps/gather.js
npm run build:<messenger|gather>:<win|mac|linux>
npm run build:linux            # build both apps for Linux
```

Build output goes to `dist/messenger` and `dist/gather`. Linux builds pass `-c.electronDist=node_modules/electron/dist` so they reuse the locally installed Electron.

## Architecture

There are three layers, with one file per app in each:

- `apps/<app>.js` is the main-process entry point. It takes the single-instance lock (a second launch focuses the existing window), sets the Windows `appUserModelId`, creates the window, and handles the macOS `activate` and `window-all-closed` events.
- `windows/<app>.js` holds the window logic and constants for that app (URL, user agent, allowed domains). `windows/shared.js` holds the common helpers:
  - `createAppWindow` creates a hidden window that is shown on `ready-to-show`, with `contextIsolation: true` and `nodeIntegration: false`. It sets the icon explicitly only on Linux.
  - `isUrlOnDomains` matches a domain or any of its subdomains.
  - `iconPath(name)` resolves to `build/<name>.png`.
  - `focusWindow` restores and focuses a window.
- `preload/<app>.js` is the renderer preload, loaded from `preload/` by filename.

### Messenger specifics
- **Link handling** (`windows/messenger.js`): any URL outside `messenger.com` or `facebook.com` opens in the system browser. Facebook's link shim (`l.facebook.com/l.php?u=...`) is unwrapped before the domain check. `will-navigate` and `will-redirect` are guarded on the main window and on popups the app allowed (popups that redirect off-site are closed).
- **Badge and notifications**: `preload/messenger.js` watches `document.title` for a `(N)` unread count, waits 800 ms for it to settle, and sends IPC to the main process:
  - `update-badge` sets the dock badge and bounce on macOS, and flashes the taskbar on Windows.
  - `show-notification` shows a native notification, but only when the window is unfocused.
  - `focus-window` focuses the window.

  The badge count only goes up until the window gains focus, and then it resets. The IPC handlers are registered in `registerMessengerIpc()`.
- Messenger uses the default session and the default `userData` path.

### Gather specifics
- **Separate profile**: `app.setName('Gather')`, a `userData` folder at `<appData>/Gather`, and session partition `persist:gather`, so Gather can run alongside Messenger.
- **Permissions**: `media`, `display-capture` and `notifications` are granted only to `gather.town` origins. Screen share goes through `setDisplayMediaRequestHandler` with `useSystemPicker: true`.
- **Notifications** use the web Notification API, which Electron turns into native notifications. `preload/gather.js` is intentionally empty so that Messenger's title watcher does not run on Gather.

## Packaging

Each app has its own electron-builder config (`electron-builder.messenger.json` and `electron-builder.gather.json`) with an **explicit `files` allowlist**. A new source file must be added to the right config, or it will be missing from the packaged app. `extraMetadata.main` points the package at the right entry point.

Icons and the macOS entitlements file live in `build/`. Messenger's icon files are named `facebook.*`.

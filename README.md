# Facebook Messenger — Electron Wrapper

A small Electron app that opens https://www.messenger.com in a native window.

## Features
- Loads messenger.com in an Electron BrowserWindow
- Keeps your session between runs (default Electron persistent session)
- External links open in your default browser
- Minimal, secure preload exposing only a small `openExternal` API

## Requirements
- Node.js >= 16 (or a modern Node recommended for the used Electron version)
- npm

## Install & Run
1. Clone or copy the files to a folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Run:
   ```
   npm start
   ```

## Notes & Suggestions
- The app uses the default Electron session so your Messenger login persists across runs.
- For packaging (creating .exe / .dmg), use a packager such as [electron-builder](https://www.electron.build/) or [electron-forge](https://www.electronforge.io/).
- For extra features you may add:
  - A tray icon and unread message badge
  - Notifications integration using the Notifications API
  - Auto-updates (requires setup with a release server)
- Security: Node integration is disabled and context isolation is enabled for safety. Keep preload small and only expose necessary functions.

## Troubleshooting
- If Messenger shows a mobile or weird layout, the user agent may be adjusted in `main.js`.
- If the app can't load messenger.com, check network / firewall and try opening messenger.com in your regular browser first.

Enjoy!
const { app, shell, ipcMain, Notification } = require('electron');
const { iconPath, isUrlOnDomains, createAppWindow, focusWindow } = require('./shared');

const MESSENGER_URL = 'https://facebook.com/messages';
// Desktop-like user agent so the site serves the web UI
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36 ElectronApp';
const ALLOWED_DOMAINS = ['messenger.com', 'facebook.com'];

const ICON_PATH = iconPath('facebook');

let messengerWindow = null;

// Facebook wraps outgoing links in a redirect shim (l.facebook.com/l.php?u=<target>)
const LINK_SHIM_HOSTS = ['l.facebook.com', 'lm.facebook.com', 'l.messenger.com'];

function isAllowedUrl(url) {
  return isUrlOnDomains(url, ALLOWED_DOMAINS);
}

// Unwrap a link-shim URL to its real target so it can be checked against the allowed domains
function resolveLinkShim(url) {
  try {
    const parsed = new URL(url);
    if (LINK_SHIM_HOSTS.includes(parsed.hostname.toLowerCase()) && parsed.pathname === '/l.php') {
      const target = parsed.searchParams.get('u');
      if (target) return target;
    }
  } catch (err) {
    // Not a valid URL, fall through
  }
  return url;
}

// Open non-allowed URLs in the default browser; returns true if the URL was sent out
function openExternalIfNeeded(url) {
  const target = resolveLinkShim(url);
  if (isAllowedUrl(target)) return false;
  shell.openExternal(target);
  return true;
}

function isMessengerFocused() {
  return Boolean(messengerWindow && !messengerWindow.isDestroyed() && messengerWindow.isFocused());
}

// Send navigations/redirects to non-allowed sites to the default browser instead
function guardNavigation(contents, onExternal) {
  const handler = (event, url, isInPlace, isMainFrame) => {
    if ((event.isMainFrame ?? isMainFrame) === false) return;
    if (openExternalIfNeeded(url)) {
      event.preventDefault();
      if (onExternal) onExternal();
    }
  };
  contents.on('will-navigate', handler);
  contents.on('will-redirect', handler);
}

function createMessengerWindow() {
  messengerWindow = createAppWindow({ width: 1100, height: 760, preload: 'messenger.js', icon: ICON_PATH });

  messengerWindow.loadURL(MESSENGER_URL, { userAgent: USER_AGENT });

  // Open external links (outside messenger/facebook) in the default browser
  messengerWindow.webContents.setWindowOpenHandler(({ url }) => {
    return openExternalIfNeeded(url) ? { action: 'deny' } : { action: 'allow' };
  });

  // Prevent navigation away from messenger to unknown sites inside the app
  guardNavigation(messengerWindow.webContents);

  // Popups allowed above may still redirect off-site, so guard them too
  messengerWindow.webContents.on('did-create-window', (childWindow) => {
    guardNavigation(childWindow.webContents, () => childWindow.close());
  });

  messengerWindow.on('closed', () => {
    messengerWindow = null;
  });

  return messengerWindow;
}

// =====================================================
// Notification & Badge Handlers
// =====================================================

function registerMessengerIpc() {
  // Handle badge count updates from renderer
  ipcMain.on('update-badge', (event, count) => {
    if (process.platform === 'darwin') {
      // macOS: Show badge on dock icon and bounce it for attention
      app.dock.setBadge(count > 0 ? String(count) : '');
      if (count > 0 && !isMessengerFocused()) {
        app.dock.bounce('informational');
      }
    } else if (process.platform === 'win32') {
      // Windows: Flash taskbar when new messages arrive
      if (count > 0 && messengerWindow && !isMessengerFocused()) {
        messengerWindow.flashFrame(true);
      }
    }

    // Linux: Some desktop environments support unity launcher API
    // but it requires additional setup
  });

  // Handle notification requests from renderer
  ipcMain.on('show-notification', (event, { title, body, silent }) => {
    if (!Notification.isSupported()) {
      console.log('[Notification] Not supported on this system');
      return;
    }

    // Only show notification if window is not focused
    if (isMessengerFocused()) {
      console.log('[Notification] Window is focused, skipping notification');
      return;
    }

    console.log('[Notification] Showing:', title, body);

    const notification = new Notification({
      title: title || 'Messenger',
      body: body || 'You have new messages',
      silent: silent || false,
      icon: ICON_PATH
    });

    // Click notification to focus the app window
    notification.on('click', () => focusWindow(messengerWindow));

    notification.show();
  });

  // Handle focus window request
  ipcMain.on('focus-window', () => {
    if (!messengerWindow) return;
    focusWindow(messengerWindow);

    // Stop flashing on Windows
    if (process.platform === 'win32') {
      messengerWindow.flashFrame(false);
    }
  });
}

function focusMessengerWindow() {
  focusWindow(messengerWindow);
}

module.exports = {
  createMessengerWindow,
  focusMessengerWindow,
  registerMessengerIpc
};

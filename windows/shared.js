const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');
const ICON_DIR = path.join(ROOT_DIR, 'build');
const PRELOAD_DIR = path.join(ROOT_DIR, 'preload');

// Path to an app's PNG icon in build/ (e.g. 'facebook' -> build/facebook.png)
function iconPath(name) {
  return path.join(ICON_DIR, `${name}.png`);
}

// True if the URL's host is one of the given domains or a subdomain of them
function isUrlOnDomains(url, domains) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch (err) {
    return false;
  }
}

// Create a hidden BrowserWindow with the shared defaults; it is shown once ready to avoid a white flash
function createAppWindow({ width, height, preload, partition, icon }) {
  // Only Linux needs the window icon set explicitly; other platforms use the packaged app icon
  const windowIcon = process.platform === 'linux' && icon && fs.existsSync(icon) ? icon : undefined;

  const win = new BrowserWindow({
    width,
    height,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, preload),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      partition
    },
    show: false
  });

  win.once('ready-to-show', () => win.show());

  return win;
}

function focusWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  win.focus();
}

module.exports = {
  iconPath,
  isUrlOnDomains,
  createAppWindow,
  focusWindow
};

const { app, desktopCapturer, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { iconPath, isUrlOnDomains, createAppWindow, focusWindow } = require('./shared');

const GATHER_URL = 'https://app.gather.town/app';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const GATHER_DOMAINS = ['gather.town'];
// Web Notifications from Gather are shown by Electron as native desktop notifications
const ALLOWED_PERMISSIONS = ['media', 'display-capture', 'notifications'];

const ICON_PATH = iconPath('gather');

// Quiet-audio boost presets (see preload/gather-audio-boost.js). The compressor squeezes the
// dynamic range above `threshold` by `ratio`, makeup gain lifts everything back up, and a limiter
// keeps peaks at the original maximum, so only quieter audio ends up louder.
const AUDIO_BOOST_PRESETS = {
  low: { label: 'Low', threshold: -30, ratio: 3, makeupDb: 3 },
  medium: { label: 'Medium', threshold: -40, ratio: 4, makeupDb: 6 },
  high: { label: 'High', threshold: -50, ratio: 6, makeupDb: 9 }
};

let gatherWindow = null;
let audioBoostLevel = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch (err) {
    return {};
  }
}

function getAudioBoostLevel() {
  if (audioBoostLevel === null) {
    const saved = readSettings().audioBoost;
    audioBoostLevel = AUDIO_BOOST_PRESETS[saved] ? saved : 'off';
  }
  return audioBoostLevel;
}

function setAudioBoostLevel(level) {
  audioBoostLevel = level;
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), audioBoost: level }, null, 2));
  } catch (err) {
    console.error('[Gather] Failed to save settings:', err);
  }
  if (gatherWindow && !gatherWindow.isDestroyed()) {
    gatherWindow.webContents.send('gather-audio-boost:set', level);
  }
}

function registerGatherIpc() {
  ipcMain.removeAllListeners('gather-audio-boost:get');
  ipcMain.on('gather-audio-boost:get', (event) => {
    event.returnValue = { level: getAudioBoostLevel(), presets: AUDIO_BOOST_PRESETS };
  });
}

function setupMenu() {
  const current = getAudioBoostLevel();
  const levels = [['off', 'Off'], ...Object.entries(AUDIO_BOOST_PRESETS).map(([key, preset]) => [key, preset.label])];

  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Audio',
      submenu: [
        { label: 'Boost Quiet Audio', enabled: false },
        ...levels.map(([key, label]) => ({
          label,
          type: 'radio',
          checked: key === current,
          click: () => setAudioBoostLevel(key)
        }))
      ]
    },
    { role: 'windowMenu' }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function isGatherUrl(url) {
  return isUrlOnDomains(url, GATHER_DOMAINS);
}

function setupPermissions(gatherSession) {
  // Allow Gather origins to request media/screen/notification permissions in this session.
  gatherSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const isGatherOrigin = isGatherUrl(details?.requestingUrl || details?.embeddingOrigin || '');
    callback(Boolean(isGatherOrigin && ALLOWED_PERMISSIONS.includes(permission)));
  });

  // Report the same permissions as granted when the page checks them (e.g. Notification.permission)
  gatherSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return isGatherUrl(requestingOrigin) && ALLOWED_PERMISSIONS.includes(permission);
  });

  gatherSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      const frameUrl = request?.frame?.url || '';
      if (!isGatherUrl(frameUrl)) {
        callback({});
        return;
      }

      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const source = sources[0];

        if (!source) {
          callback({});
          return;
        }

        callback({
          video: source,
          audio: request.audioRequested ? 'loopback' : 'none'
        });
      } catch (err) {
        console.error('[Gather] Failed to get screen sources:', err);
        callback({});
      }
    },
    { useSystemPicker: true }
  );
}

function createGatherWindow() {
  registerGatherIpc();
  setupMenu();

  gatherWindow = createAppWindow({ width: 1200, height: 800, preload: 'gather.js', partition: 'persist:gather', icon: ICON_PATH });

  setupPermissions(gatherWindow.webContents.session);

  gatherWindow.loadURL(GATHER_URL, { userAgent: USER_AGENT });

  gatherWindow.on('closed', () => {
    gatherWindow = null;
  });

  return gatherWindow;
}

function focusGatherWindow() {
  focusWindow(gatherWindow);
}

module.exports = {
  createGatherWindow,
  focusGatherWindow
};

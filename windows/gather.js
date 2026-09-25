const { desktopCapturer } = require('electron');
const { isUrlOnDomains, createAppWindow } = require('./shared');

const GATHER_URL = 'https://app.gather.town/app';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const GATHER_DOMAINS = ['gather.town'];
// Web Notifications from Gather are shown by Electron as native desktop notifications
const ALLOWED_PERMISSIONS = ['media', 'display-capture', 'notifications'];

let gatherWindow = null;

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
  gatherWindow = createAppWindow({ width: 1200, height: 800, preload: 'gather.js', partition: 'persist:gather' });

  setupPermissions(gatherWindow.webContents.session);

  gatherWindow.loadURL(GATHER_URL, { userAgent: USER_AGENT });

  gatherWindow.on('closed', () => {
    gatherWindow = null;
  });

  return gatherWindow;
}

module.exports = {
  createGatherWindow
};

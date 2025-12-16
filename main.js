const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    show: false
  });

  // Set a desktop-like user agent so the site serves the web UI
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36 ElectronApp';

  win.loadURL('https://www.messenger.com', { userAgent });

  // Show when ready to avoid white flash
  win.once('ready-to-show', () => win.show());

  // Open external links (outside messenger/facebook) in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const allowedOrigins = ['https://www.messenger.com', 'https://www.facebook.com'];
      if (allowedOrigins.includes(parsed.origin)) {
        return { action: 'allow' };
      }
    } catch (err) {
      // If URL is malformed, open externally as fallback
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent navigation away from messenger to unknown sites inside the app
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const parsed = new URL(url);
      const allowedOrigins = ['https://www.messenger.com', 'https://www.facebook.com'];
      if (!allowedOrigins.includes(parsed.origin)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (err) {
      // If parsing fails, block navigation
      event.preventDefault();
    }
  });

  // Optional: handle links clicked inside pages (anchor target=_blank)
  win.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });
}

app.whenReady().then(() => {
  // On Windows, set an appUserModelId for proper notifications and jump lists
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.example.facebook-messenger-electron');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS it's common for apps to stay open until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
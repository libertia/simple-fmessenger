const { app, BrowserWindow, shell, ipcMain, Notification, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.loadURL('https://www.messenger.com', { userAgent });

  // Show when ready to avoid white flash
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Helper function to check if URL is an allowed domain
  const isAllowedDomain = (url) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      // Allow messenger.com and facebook.com and all their subdomains
      return hostname.endsWith('messenger.com') || 
             hostname.endsWith('facebook.com') ||
             hostname === 'messenger.com' ||
             hostname === 'facebook.com';
    } catch (err) {
      return false;
    }
  };

  // Open external links (outside messenger/facebook) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedDomain(url)) {
      return { action: 'allow' };
    }
    // Open in external browser for non-messenger/facebook domains
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent navigation away from messenger to unknown sites inside the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedDomain(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Handle new window requests (for older Electron versions compatibility)
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    if (!isAllowedDomain(url)) {
      shell.openExternal(url);
    }
  });
}

// =====================================================
// Notification & Badge Handlers
// =====================================================

// Handle badge count updates from renderer
ipcMain.on('update-badge', (event, count) => {
  if (process.platform === 'darwin') {
    // macOS: Show badge on dock icon
    app.dock.setBadge(count > 0 ? String(count) : '');
    
    // Also bounce the dock icon for attention
    if (count > 0 && !mainWindow.isFocused()) {
      app.dock.bounce('informational');
    }
  } else if (process.platform === 'win32') {
    // Windows: Flash taskbar when new messages arrive
    if (count > 0 && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
    }
  }
  
  // Linux: Some desktop environments support unity launcher API
  // but it requires additional setup
});

// Handle notification requests from renderer
ipcMain.on('show-notification', (event, { title, body, silent }) => {
  // Check if notifications are supported
  if (!Notification.isSupported()) {
    console.log('[Notification] Not supported on this system');
    return;
  }

  // Only show notification if window is not focused
  if (mainWindow && mainWindow.isFocused()) {
    console.log('[Notification] Window is focused, skipping notification');
    return;
  }

  console.log('[Notification] Showing:', title, body);

  const notification = new Notification({
    title: title || 'Messenger',
    body: body || 'You have new messages',
    silent: silent || false,
    icon: path.join(__dirname, 'build/icon.png')
  });

  // Click notification to focus the app window
  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  notification.show();
});

// Handle focus window request
ipcMain.on('focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    
    // Stop flashing on Windows
    if (process.platform === 'win32') {
      mainWindow.flashFrame(false);
    }
  }
});

// =====================================================
// App Lifecycle
// =====================================================

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
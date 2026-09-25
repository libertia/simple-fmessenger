const { app, BrowserWindow } = require('electron');
const { createMessengerWindow, registerMessengerIpc, focusMessengerWindow } = require('../windows/messenger');

// Only one Messenger instance; a second launch focuses the existing window
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerMessengerIpc();

  app.on('second-instance', () => focusMessengerWindow());

  app.whenReady().then(() => {
    // On Windows, set an appUserModelId for proper notifications and jump lists
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.messenger.electron');
    }

    createMessengerWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMessengerWindow();
    });
  });

  app.on('window-all-closed', () => {
    // On macOS it's common for apps to stay open until user quits explicitly
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

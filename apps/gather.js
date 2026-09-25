const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createGatherWindow, focusGatherWindow } = require('../windows/gather');

// Keep Gather's profile apart from Messenger's so both apps can run at the same time
app.setName('Gather');
app.setPath('userData', path.join(app.getPath('appData'), 'Gather'));

// Only one Gather instance; a second launch focuses the existing window
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => focusGatherWindow());

  app.whenReady().then(() => {
    // On Windows, set an appUserModelId for proper notifications and jump lists
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.gather.electron');
    }

    createGatherWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createGatherWindow();
    });
  });

  app.on('window-all-closed', () => {
    // On macOS it's common for apps to stay open until user quits explicitly
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

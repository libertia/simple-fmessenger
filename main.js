const { app, BrowserWindow } = require('electron');
const { createMessengerWindow, registerMessengerIpc } = require('./windows/messenger');
const { createGatherWindow } = require('./windows/gather');

registerMessengerIpc();

app.whenReady().then(() => {
  // On Windows, set an appUserModelId for proper notifications and jump lists
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.example.facebook-messenger-electron');
  }

  createMessengerWindow();
  createGatherWindow();

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

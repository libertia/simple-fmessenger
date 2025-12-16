const { contextBridge, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Open a URL in the user's default browser
  openExternal: (url) => {
    try {
      // Basic validation
      const parsed = new URL(url);
      shell.openExternal(parsed.toString());
    } catch (err) {
      // ignore invalid URLs
    }
  }
});
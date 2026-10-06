// Preload for the Gather window.
// Kept separate from the Messenger preload so Messenger's title watcher
// (badge + "New Message" notifications) doesn't run on Gather.
// Gather's own notifications use the web Notification API, which Electron
// shows as native desktop notifications (see windows/gather.js permissions).
const { contextBridge, ipcRenderer } = require('electron');
const { installAudioBoost } = require('./gather-audio-boost');

// Install the quiet-audio boost before Gather's scripts run (see preload/gather-audio-boost.js)
const { level, presets } = ipcRenderer.sendSync('gather-audio-boost:get');
contextBridge.executeInMainWorld({ func: installAudioBoost, args: [level, presets] });

ipcRenderer.on('gather-audio-boost:set', (event, nextLevel) => {
  contextBridge.executeInMainWorld({
    func: (next) => window[Symbol.for('gather-audio-boost')]?.setLevel(next),
    args: [nextLevel]
  });
});

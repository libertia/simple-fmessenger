// Preload for the Gather window.
// Kept separate from the Messenger preload so Messenger's title watcher
// (badge + "New Message" notifications) doesn't run on Gather.
// Gather's own notifications use the web Notification API, which Electron
// shows as native desktop notifications (see windows/gather.js permissions).

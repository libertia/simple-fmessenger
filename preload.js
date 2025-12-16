const { contextBridge, ipcRenderer, shell } = require('electron');

// =====================================================
// State Management
// =====================================================
let highestUnreadCount = 0;  // Highest count seen since last focus
let lastNotifiedCount = 0;   // Count at which we last sent notification
let isInitialized = false;

// =====================================================
// Expose APIs to Renderer
// =====================================================
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => {
    try {
      const parsed = new URL(url);
      shell.openExternal(parsed.toString());
    } catch (err) {
      // ignore invalid URLs
    }
  },
  
  updateBadge: (count) => {
    ipcRenderer.send('update-badge', count);
  },
  
  showNotification: (title, body, silent = false) => {
    ipcRenderer.send('show-notification', { title, body, silent });
  },
  
  focusWindow: () => {
    ipcRenderer.send('focus-window');
  }
});

// =====================================================
// Message Detection Logic
// =====================================================

/**
 * Extract unread count from page title
 */
function getUnreadCountFromTitle() {
  const title = document.title;
  const match = title.match(/^\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Handle unread count changes
 */
function handleUnreadCountChange(newCount) {
  // Always update badge with current count
  ipcRenderer.send('update-badge', newCount);
  
  // Update highest seen count
  if (newCount > highestUnreadCount) {
    highestUnreadCount = newCount;
  }
  
  // Only show notification if count exceeds our last notified count
  // This prevents repeated notifications when title flickers
  if (newCount > lastNotifiedCount && newCount > 0) {
    const diff = newCount - lastNotifiedCount;
    
    console.log('[Messenger] New messages:', diff, 'Total:', newCount);
    
    ipcRenderer.send('show-notification', {
      title: 'New Message',
      body: diff === 1 
        ? 'You have a new message'
        : `You have ${diff} new messages`,
      silent: false
    });
    
    // Remember that we notified at this count
    lastNotifiedCount = newCount;
  }
}

/**
 * Reset counters when window gets focus (user has seen messages)
 */
function setupFocusHandler() {
  window.addEventListener('focus', () => {
    console.log('[Messenger] Window focused, resetting notification counter');
    // Reset counters - user has seen the messages
    const currentCount = getUnreadCountFromTitle();
    lastNotifiedCount = currentCount;
    highestUnreadCount = currentCount;
  });
}

/**
 * Watch for title changes to detect new messages
 */
function watchTitleChanges() {
  const titleElement = document.querySelector('title');
  if (!titleElement) {
    console.log('[Messenger] Title element not found, retrying...');
    setTimeout(watchTitleChanges, 1000);
    return;
  }
  
  const titleObserver = new MutationObserver(() => {
    const count = getUnreadCountFromTitle();
    handleUnreadCountChange(count);
  });
  
  titleObserver.observe(titleElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
  
  // Initial setup - don't notify for existing messages
  const initialCount = getUnreadCountFromTitle();
  lastNotifiedCount = initialCount;
  highestUnreadCount = initialCount;
  ipcRenderer.send('update-badge', initialCount);
  
  console.log('[Messenger] Initialized with count:', initialCount);
}

/**
 * Initialize all watchers
 */
function initializeWatchers() {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log('[Messenger] Initializing...');
  
  setupFocusHandler();
  watchTitleChanges();
}

// =====================================================
// Initialization
// =====================================================

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initializeWatchers, 500);
} else {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeWatchers, 500);
  });
}

window.addEventListener('load', () => {
  setTimeout(initializeWatchers, 1000);
});
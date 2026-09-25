const { contextBridge, ipcRenderer, shell } = require('electron');

// =====================================================
// State Management
// =====================================================
let lastTitle = '';           // Last stable title (after debounce)
let lastNotifiedTitle = '';   // Title when we last notified
let currentBadgeCount = 0;    // Current badge shown (only goes UP, never down)
let debounceTimer = null;
let isInitialized = false;

const DEBOUNCE_MS = 800;      // Wait 800ms for title to stabilize

// =====================================================
// Expose APIs to Renderer
// =====================================================
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => {
    try {
      const parsed = new URL(url);
      shell.openExternal(parsed.toString());
    } catch (err) {}
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
function getUnreadCountFromTitle(title) {
  const match = title.match(/^\((\d+)\)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Process title change after debounce
 */
function processStableTitle(newTitle) {
  const count = getUnreadCountFromTitle(newTitle);
  
  // Badge logic: only UPDATE if count is HIGHER than current
  // This prevents flickering - badge never goes down until reset
  if (count > currentBadgeCount) {
    currentBadgeCount = count;
    ipcRenderer.send('update-badge', count);
    console.log('[Messenger] Badge updated to:', count);
  }
  
  // Notification logic: notify if title changed and has unread
  if (count > 0 && newTitle !== lastNotifiedTitle) {
    console.log('[Messenger] New message detected');
    
    ipcRenderer.send('show-notification', {
      title: 'New Message',
      body: 'You have a new message',
      silent: false
    });
    
    lastNotifiedTitle = newTitle;
  }
  
  lastTitle = newTitle;
}

/**
 * Handle title change with debounce
 */
function handleTitleChange() {
  const currentTitle = document.title;
  
  // Clear any pending debounce
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  // Debounce both badge and notification
  debounceTimer = setTimeout(() => {
    processStableTitle(currentTitle);
  }, DEBOUNCE_MS);
}

/**
 * Reset when window gets focus - user has seen messages
 */
function setupFocusHandler() {
  window.addEventListener('focus', () => {
    console.log('[Messenger] Window focused, resetting counters');
    
    // Get actual current count
    const actualCount = getUnreadCountFromTitle(document.title);
    
    // Reset everything
    currentBadgeCount = actualCount;
    lastNotifiedTitle = document.title;
    lastTitle = document.title;
    
    // Update badge to actual count (might be 0 if user read messages)
    ipcRenderer.send('update-badge', actualCount);
  });
}

/**
 * Watch for title changes
 */
function watchTitleChanges() {
  const titleElement = document.querySelector('title');
  if (!titleElement) {
    setTimeout(watchTitleChanges, 1000);
    return;
  }
  
  const titleObserver = new MutationObserver(() => {
    handleTitleChange();
  });
  
  titleObserver.observe(titleElement, {
    childList: true,
    characterData: true,
    subtree: true
  });
  
  // Initial setup - don't notify for existing state
  const initialTitle = document.title;
  const initialCount = getUnreadCountFromTitle(initialTitle);
  
  lastTitle = initialTitle;
  lastNotifiedTitle = initialTitle;
  currentBadgeCount = initialCount;
  
  ipcRenderer.send('update-badge', initialCount);
  
  console.log('[Messenger] Initialized with count:', initialCount);
}

/**
 * Initialize
 */
function initializeWatchers() {
  if (isInitialized) return;
  isInitialized = true;
  
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

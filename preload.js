const { contextBridge, ipcRenderer, shell } = require('electron');

// =====================================================
// State Management
// =====================================================
let lastUnreadCount = 0;
let isInitialized = false;

// =====================================================
// Expose APIs to Renderer
// =====================================================
contextBridge.exposeInMainWorld('electronAPI', {
  // Open a URL in the user's default browser
  openExternal: (url) => {
    try {
      const parsed = new URL(url);
      shell.openExternal(parsed.toString());
    } catch (err) {
      // ignore invalid URLs
    }
  },
  
  // Update badge count
  updateBadge: (count) => {
    ipcRenderer.send('update-badge', count);
  },
  
  // Show notification
  showNotification: (title, body, silent = false) => {
    ipcRenderer.send('show-notification', { title, body, silent });
  },
  
  // Focus main window
  focusWindow: () => {
    ipcRenderer.send('focus-window');
  }
});

// =====================================================
// Message Detection Logic
// =====================================================

/**
 * Extract unread count from page title
 * Messenger uses format: "(3) Messenger" or "(3) Name - Messenger"
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
  // Send badge update
  ipcRenderer.send('update-badge', newCount);
  
  // Show notification only when count increases
  if (newCount > lastUnreadCount && lastUnreadCount >= 0) {
    const diff = newCount - lastUnreadCount;
    
    ipcRenderer.send('show-notification', {
      title: 'New Message',
      body: diff === 1 
        ? 'You have a new message'
        : `You have ${diff} new messages`,
      silent: false
    });
  }
  
  lastUnreadCount = newCount;
}

/**
 * Watch for title changes to detect new messages
 */
function watchTitleChanges() {
  // Create observer for title element
  const titleObserver = new MutationObserver(() => {
    const count = getUnreadCountFromTitle();
    handleUnreadCountChange(count);
  });
  
  // Try to find and observe the title element
  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
    
    // Initial check
    const initialCount = getUnreadCountFromTitle();
    ipcRenderer.send('update-badge', initialCount);
    lastUnreadCount = initialCount;
    
    console.log('[Messenger Electron] Title observer initialized');
  } else {
    // Title element not found, retry after delay
    console.log('[Messenger Electron] Title element not found, retrying...');
    setTimeout(watchTitleChanges, 1000);
  }
}

/**
 * Watch for favicon changes (alternative detection method)
 * Messenger sometimes updates favicon with badge
 */
function watchFaviconChanges() {
  const faviconObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
        // Favicon changed, trigger title check as backup
        const count = getUnreadCountFromTitle();
        handleUnreadCountChange(count);
      }
    });
  });
  
  // Observe all link elements for favicon changes
  const links = document.querySelectorAll('link[rel*="icon"]');
  links.forEach((link) => {
    faviconObserver.observe(link, { attributes: true });
  });
}

/**
 * Periodic fallback check (in case observers miss something)
 */
function startPeriodicCheck() {
  setInterval(() => {
    const count = getUnreadCountFromTitle();
    if (count !== lastUnreadCount) {
      handleUnreadCountChange(count);
    }
  }, 5000); // Check every 5 seconds
}

/**
 * Initialize all watchers
 */
function initializeWatchers() {
  if (isInitialized) return;
  isInitialized = true;
  
  console.log('[Messenger Electron] Initializing message watchers...');
  
  watchTitleChanges();
  watchFaviconChanges();
  startPeriodicCheck();
}

// =====================================================
// Initialization
// =====================================================

// Start watching when DOM is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  // DOM already loaded
  setTimeout(initializeWatchers, 500);
} else {
  // Wait for DOM
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeWatchers, 500);
  });
}

// Also try on load event as fallback
window.addEventListener('load', () => {
  setTimeout(initializeWatchers, 1000);
});
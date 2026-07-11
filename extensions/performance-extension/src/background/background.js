/**
 * OWSH Speed Audit - Background Service Worker
 */

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('OWSH Speed Audit installed');
  } else if (details.reason === 'update') {
    console.log('OWSH Speed Audit updated to', chrome.runtime.getManifest().version);
  }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getTabId') {
    sendResponse({ tabId: sender.tab?.id });
  }
  return true;
});

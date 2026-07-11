// Background service worker for OWSH Page Audit extension

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('OWSH Page Audit extension installed');
  } else if (details.reason === 'update') {
    console.log('OWSH Page Audit extension updated');
  }
});

// Handle messages from popup or content scripts if needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openFullAudit') {
    const { url, keyword } = message;
    const auditUrl = `https://audit.owshsystems.com/page-audit?url=${encodeURIComponent(url)}&keyword=${encodeURIComponent(keyword || '')}`;

    chrome.tabs.create({ url: auditUrl });
    sendResponse({ success: true });
  }

  return true; // Keep message channel open for async response
});

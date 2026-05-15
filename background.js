/**
 * BabelTube — background service worker
 * Handles extension install/update events and seeds default settings.
 */

const DEFAULT_SETTINGS = {
  targetLanguage: 'en',
  targetLanguageName: 'English',
  showBanner: true,
  bannerDismissDuration: 10, // seconds; 0 = never auto-dismiss
  enableSubtitles: true,
  enableAutoTranslateFallback: true,
};

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.storage.sync.set(DEFAULT_SETTINGS);
  }
});

'use strict';

// Language display helper
function getLanguageName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

// ─── Load settings and populate toggles ──────────────────────────────────────

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, resolve);
  });
}

async function saveSettings(patch) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(patch, resolve);
  });
}

// ─── Detect if the active tab is a YouTube watch page ────────────────────────

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) =>
      resolve(tab)
    );
  });
}

function isWatchPage(url) {
  try {
    const u = new URL(url);
    return (
      (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') &&
      u.pathname === '/watch'
    );
  } catch {
    return false;
  }
}

async function getVideoInfo(tabId, targetLanguage, enableSubtitles) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      files: ['content_scripts/language-utils.js'],
      func: (targetLang, subsEnabled) => {
        const L = window.BabelTubeLang;
        if (!L) return null;

        const videoId = L.getWatchVideoIdFromUrl();
        if (!videoId) return null;

        const resolved = L.resolvePlayerResponse(videoId);
        if (!resolved?.ipr) return null;

        const cap = L.extractCaptionData(resolved.ipr);
        const playerAudioCode = L.getPlayerAudioTrackCode();
        const adaptiveAudioCode = L.getAdaptiveDefaultAudioCode(resolved.ipr);

        const detection = L.detectVideoLanguage({
          playerAudioCode,
          adaptiveAudioCode,
          audioLanguageCode: cap.audioLanguageCode,
          captionTracks: cap.captionTracks,
          audioTracks: cap.audioTracks,
          defaultAudioTrackIndex: cap.defaultAudioTrackIndex,
          targetLanguage: targetLang,
        });

        const subtitleLabel = L.getSubtitleStatusLabel({
          captionTracks: cap.captionTracks,
          enableSubtitles: subsEnabled,
          detectedCode: detection.code,
          targetLanguage: targetLang,
          ambiguous: detection.ambiguous,
        });

        return {
          detectedCode: detection.code,
          ambiguous: detection.ambiguous,
          method: detection.method,
          subtitleLabel,
          resolveSource: resolved.source,
        };
      },
      args: [targetLanguage || 'en', enableSubtitles !== false],
    });
    return results?.[0]?.result ?? null;
  } catch {
    return null;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function init() {
  const tab = await getActiveTab();
  const onWatchPage = tab && isWatchPage(tab.url);

  document.getElementById('watch-view').style.display = onWatchPage
    ? 'block'
    : 'none';
  document.getElementById('no-watch-view').style.display = onWatchPage
    ? 'none'
    : 'block';

  const settings = await loadSettings();

  // Populate target language
  const targetName =
    settings.targetLanguageName ||
    getLanguageName(settings.targetLanguage || 'en');
  document.getElementById('lang-target').textContent = targetName;

  if (onWatchPage) {
    const target = (settings.targetLanguage || 'en').toLowerCase();
    const subsEnabled = settings.enableSubtitles !== false;
    const info = await getVideoInfo(tab.id, target, subsEnabled);

    const detectedEl = document.getElementById('lang-detected');
    const subtitleEl = document.getElementById('subtitle-status');

    if (info?.ambiguous) {
      detectedEl.textContent = "Couldn't determine";
      detectedEl.className = 'status-value na';
    } else if (info?.detectedCode) {
      detectedEl.textContent = getLanguageName(info.detectedCode);
      const isForeign = info.detectedCode !== target;
      detectedEl.className = `status-value ${isForeign ? 'detected' : 'ok'}`;
    } else {
      detectedEl.textContent = 'Unknown';
      detectedEl.className = 'status-value na';
    }

    if (info?.subtitleLabel) {
      subtitleEl.textContent = info.subtitleLabel;
      if (info.subtitleLabel.includes('Already in target')) {
        subtitleEl.className = 'status-value ok';
      } else if (info.ambiguous || info.subtitleLabel.includes('Opening')) {
        subtitleEl.className = 'status-value detected';
      } else if (info.subtitleLabel.includes('Human subs')) {
        subtitleEl.className = 'status-value ok';
      } else if (info.subtitleLabel === 'Auto-translate') {
        subtitleEl.className = 'status-value detected';
      } else if (info.subtitleLabel === 'Disabled' || info.subtitleLabel === 'No captions') {
        subtitleEl.className = 'status-value na';
      } else {
        subtitleEl.className = 'status-value ok';
      }
    } else if (!subsEnabled) {
      subtitleEl.textContent = 'Disabled';
      subtitleEl.className = 'status-value na';
    } else {
      subtitleEl.textContent = 'No captions';
      subtitleEl.className = 'status-value na';
    }
  }

  // Populate toggles
  document.getElementById('toggle-banner').checked =
    settings.showBanner !== false;
  document.getElementById('toggle-subtitles').checked =
    settings.enableSubtitles !== false;
  document.getElementById('toggle-autotranslate').checked =
    settings.enableAutoTranslateFallback !== false;

  // Toggle listeners
  document.getElementById('toggle-banner').addEventListener('change', (e) =>
    saveSettings({ showBanner: e.target.checked })
  );
  document.getElementById('toggle-subtitles').addEventListener('change', (e) =>
    saveSettings({ enableSubtitles: e.target.checked })
  );
  document.getElementById('toggle-autotranslate').addEventListener(
    'change',
    (e) => saveSettings({ enableAutoTranslateFallback: e.target.checked })
  );

  // Open full settings
  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

init();

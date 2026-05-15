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

// ─── Inject a script into the active tab to read ytInitialPlayerResponse ─────

async function getVideoInfo(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN', // ytInitialPlayerResponse exists only in the page world
      func: () => {
        const ipr = window.ytInitialPlayerResponse;
        if (!ipr) return null;

        const tracks =
          ipr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];

        // Detect video language (same logic as content script)
        let detectedCode = null;
        const audioTracks =
          ipr?.captions?.playerCaptionsTracklistRenderer?.audioTracks;
        if (audioTracks?.length) {
          const idx =
            ipr.captions.playerCaptionsTracklistRenderer
              .defaultAudioTrackIndex ?? 0;
          const at = audioTracks[idx] ?? audioTracks[0];
          const ctIdx = at?.captionTrackIndices?.[0];
          if (ctIdx !== undefined) {
            detectedCode = tracks[ctIdx]?.languageCode ?? null;
          }
        }
        if (!detectedCode && tracks.length) {
          const human = tracks.find((t) => t.kind !== 'asr');
          detectedCode = (human ?? tracks[0])?.languageCode ?? null;
        }

        return {
          detectedCode: detectedCode?.toLowerCase() ?? null,
          hasCaptions: tracks.length > 0,
          hasHumanCaptions: tracks.some((t) => t.kind !== 'asr'),
          hasAsr: tracks.some((t) => t.kind === 'asr'),
        };
      },
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
    // Try to read video info from the tab
    const info = await getVideoInfo(tab.id);

    const detectedEl = document.getElementById('lang-detected');
    const subtitleEl = document.getElementById('subtitle-status');

    if (info?.detectedCode) {
      const name = getLanguageName(info.detectedCode);
      detectedEl.textContent = name;
      const isForeign =
        info.detectedCode !== (settings.targetLanguage || 'en').toLowerCase();
      detectedEl.className = `status-value ${isForeign ? 'detected' : 'ok'}`;
    } else {
      detectedEl.textContent = 'Unknown';
      detectedEl.className = 'status-value na';
    }

    if (!settings.enableSubtitles) {
      subtitleEl.textContent = 'Disabled';
      subtitleEl.className = 'status-value na';
    } else if (info?.hasHumanCaptions) {
      subtitleEl.textContent = 'Human subs ✓';
      subtitleEl.className = 'status-value ok';
    } else if (info?.hasAsr) {
      subtitleEl.textContent = 'Auto-translate';
      subtitleEl.className = 'status-value detected';
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

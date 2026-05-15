/**
 * BabelTube — content script for youtube.com/watch pages
 *
 * Flow:
 *  1. On page load and every SPA navigation (yt-navigate-finish), detect the
 *     video's audio language from ytInitialPlayerResponse.
 *  2. If the video language differs from the user's target language:
 *     a. Optionally show an instructional banner (guides user to right-click → Translate).
 *     b. Automatically select the best subtitle track via YouTube's player API.
 *        Priority: human subs in target lang → ASR track + auto-translate → nothing.
 *
 * DEBUG: All decisions are logged under the [BabelTube] prefix.
 *        Open Chrome DevTools (F12) → Console on any YouTube watch page to see them.
 *        Filter by "BabelTube" to isolate logs.
 *
 * NOTE: YouTube Shorts (youtube.com/shorts/) are intentionally excluded.
 * TODO: Shorts support (youtube.com/shorts/)
 */

'use strict';

// ─── Debug logger ─────────────────────────────────────────────────────────────

const LOG_PREFIX = '%c[BabelTube]';
const LOG_STYLE  = 'color:#ff4444;font-weight:bold';
const LOG_STYLE_DIM = 'color:#888;font-weight:normal';

const log = {
  info:  (...args) => console.log(LOG_PREFIX, LOG_STYLE, ...args),
  warn:  (...args) => console.warn(LOG_PREFIX, LOG_STYLE, ...args),
  error: (...args) => console.error(LOG_PREFIX, LOG_STYLE, ...args),
  dim:   (...args) => console.log(LOG_PREFIX, LOG_STYLE_DIM, ...args),
  group: (label)   => console.groupCollapsed(`${LOG_PREFIX.replace('%c', '')} ${label}`),
  groupEnd: ()     => console.groupEnd(),
  table: (data)    => { console.log(LOG_PREFIX, LOG_STYLE, 'Table:'); console.table(data); },
};

// ─── Constants ───────────────────────────────────────────────────────────────

const BANNER_ID = 'babeltube-banner';
const PLAYER_READY_POLL_MS = 300;
const PLAYER_READY_TIMEOUT_MS = 15000;

// ─── Settings cache (refreshed on each navigation) ───────────────────────────

let settings = {
  targetLanguage: 'en',
  targetLanguageName: 'English',
  showBanner: true,
  bannerDismissDuration: 10,
  enableSubtitles: true,
  enableAutoTranslateFallback: true,
};

async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      settings = { ...settings, ...items };
      log.dim('Settings loaded:', JSON.stringify(settings));
      resolve();
    });
  });
}

// ─── Language detection ───────────────────────────────────────────────────────

/**
 * Returns the detected audio language code for the current video, or null if
 * it cannot be determined.
 *
 * YouTube exposes ytInitialPlayerResponse as a global. We look in two places:
 *  1. captions.playerCaptionsTracklistRenderer.audioTracks (multi-audio videos)
 *  2. The first captionTrack's languageCode as a proxy for the audio language
 */
function detectVideoLanguage() {
  const ipr = window.ytInitialPlayerResponse;

  if (!ipr) {
    log.warn('ytInitialPlayerResponse is not available on this page yet.');
    return null;
  }

  log.dim('ytInitialPlayerResponse found. Checking audio/caption data...');

  try {
    // Path 1 — multi-audio-track videos expose audio language directly
    const audioTracks =
      ipr?.captions?.playerCaptionsTracklistRenderer?.audioTracks;
    if (audioTracks && audioTracks.length > 0) {
      const defaultIdx =
        ipr.captions.playerCaptionsTracklistRenderer.defaultAudioTrackIndex ?? 0;
      const track = audioTracks[defaultIdx] ?? audioTracks[0];
      const ctIdx = track?.captionTrackIndices?.[0];
      if (ctIdx !== undefined) {
        const langCode =
          ipr.captions.playerCaptionsTracklistRenderer.captionTracks?.[ctIdx]
            ?.languageCode;
        if (langCode) {
          log.info(`Language detected via audioTracks[${defaultIdx}]: "${langCode}"`);
          return langCode.toLowerCase();
        }
      }
      log.dim('audioTracks present but could not resolve languageCode from captionTrackIndices.');
    } else {
      log.dim('No audioTracks in playerCaptionsTracklistRenderer.');
    }

    // Path 2 — infer from caption tracks
    const captionTracks =
      ipr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (captionTracks && captionTracks.length > 0) {
      log.dim(`${captionTracks.length} caption track(s) found. Using first non-ASR as language proxy.`);
      const humanTrack = captionTracks.find((t) => t.kind !== 'asr');
      const track = humanTrack ?? captionTracks[0];
      const langCode = track.languageCode?.toLowerCase() ?? null;
      log.info(`Language detected via captionTracks fallback: "${langCode}" (kind="${track.kind}", name="${track.name?.simpleText}")`);
      return langCode;
    }

    log.warn(
      'Could not detect video language: no audioTracks and no captionTracks found in ytInitialPlayerResponse. ' +
      'This video may have no captions at all (e.g. hardcoded/burned-in subtitles).'
    );
    // Dump the captions object so we can inspect it
    log.dim('ytInitialPlayerResponse.captions =', JSON.stringify(ipr?.captions ?? null, null, 2));

  } catch (e) {
    log.error('Exception while reading ytInitialPlayerResponse:', e);
  }
  return null;
}

/**
 * Returns all available caption tracks from ytInitialPlayerResponse.
 */
function getCaptionTracks() {
  try {
    const tracks =
      window.ytInitialPlayerResponse?.captions
        ?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    return tracks;
  } catch {
    return [];
  }
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v') ?? '';
}

function isBannerDismissedForVideo(videoId) {
  return sessionStorage.getItem(`babeltube_dismissed_${videoId}`) === '1';
}

function markBannerDismissed(videoId) {
  sessionStorage.setItem(`babeltube_dismissed_${videoId}`, '1');
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
}

function showBanner(detectedLangName) {
  if (document.getElementById(BANNER_ID)) {
    log.dim('Banner already visible — skipping.');
    return;
  }

  const targetName = settings.targetLanguageName || 'English';
  const sourceName = detectedLangName || 'a foreign language';

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');

  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '9999999',
    background: 'linear-gradient(90deg, #1a1a2e 0%, #16213e 100%)',
    color: '#eaeaea',
    fontFamily: "'Roboto', Arial, sans-serif",
    fontSize: '13px',
    padding: '9px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    borderBottom: '2px solid #ff4444',
  });

  const logo = document.createElement('span');
  logo.textContent = '🗼';
  logo.style.fontSize = '16px';
  logo.setAttribute('aria-hidden', 'true');

  const msg = document.createElement('span');
  msg.style.flex = '1';
  msg.innerHTML =
    `<strong>BabelTube</strong> detected this video is in <strong>${sourceName}</strong>. ` +
    `Right-click anywhere on the page and select <strong>"Translate to ${targetName}"</strong> to translate the page using Chrome.`;

  const btn = document.createElement('button');
  btn.textContent = '✕';
  btn.title = 'Dismiss';
  Object.assign(btn.style, {
    background: 'transparent',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '0 4px',
    lineHeight: '1',
    flexShrink: '0',
  });
  btn.addEventListener('click', () => {
    log.dim('Banner dismissed by user.');
    markBannerDismissed(getVideoId());
    removeBanner();
  });

  banner.appendChild(logo);
  banner.appendChild(msg);
  banner.appendChild(btn);
  document.body.prepend(banner);
  log.info(`Banner shown: video is "${sourceName}", target is "${targetName}".`);

  const duration = settings.bannerDismissDuration;
  if (duration > 0) {
    log.dim(`Banner will auto-dismiss in ${duration}s.`);
    setTimeout(() => {
      banner.style.transition = 'opacity 0.5s ease';
      banner.style.opacity = '0';
      setTimeout(removeBanner, 500);
    }, duration * 1000);
  } else {
    log.dim('Banner auto-dismiss is disabled (set to Never).');
  }
}

// ─── Subtitle / caption selection ────────────────────────────────────────────

/**
 * Waits for the YouTube player element to expose the setOption method.
 */
function waitForPlayer() {
  return new Promise((resolve) => {
    const start = Date.now();
    log.dim('Waiting for #movie_player to be ready (setOption available)...');
    const check = () => {
      const player = document.querySelector('#movie_player');
      if (player && typeof player.setOption === 'function') {
        log.dim(`Player ready after ${Date.now() - start}ms.`);
        resolve(player);
        return;
      }
      if (Date.now() - start > PLAYER_READY_TIMEOUT_MS) {
        log.warn(
          `Player not ready after ${PLAYER_READY_TIMEOUT_MS}ms timeout. ` +
          `#movie_player found: ${!!player}, setOption available: ${typeof player?.setOption}`
        );
        resolve(null);
        return;
      }
      setTimeout(check, PLAYER_READY_POLL_MS);
    };
    check();
  });
}

/**
 * Selects the best available caption track for the target language.
 *
 * Priority:
 *  1. Human-made subtitle track in target language (kind !== 'asr')
 *  2. ASR (auto-generated) track + auto-translate to target language
 *  3. Any non-target track + auto-translate (last resort)
 *  4. Give up — no usable tracks
 */
async function selectBestSubtitleTrack(player) {
  const tracks = getCaptionTracks();
  const target = settings.targetLanguage.toLowerCase();

  log.group('Subtitle track selection');

  if (!tracks.length) {
    log.warn('No caption tracks found in ytInitialPlayerResponse — cannot auto-select subtitles.');
    log.groupEnd();
    return;
  }

  log.info(`${tracks.length} caption track(s) available:`);
  log.table(
    tracks.map((t) => ({
      languageCode: t.languageCode,
      kind: t.kind ?? 'human',
      name: t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? '?',
      vssId: t.vssId,
    }))
  );

  // 1. Human subtitles in target language
  const humanTrack = tracks.find(
    (t) => t.languageCode?.toLowerCase() === target && t.kind !== 'asr'
  );
  if (humanTrack) {
    log.info(`✓ Found human subtitle track in target language "${target}". Selecting it.`);
    player.setOption('captions', 'track', {
      languageCode: humanTrack.languageCode,
      vssId: humanTrack.vssId,
    });
    log.groupEnd();
    return;
  }
  log.dim(`No human subtitle track found for target language "${target}".`);

  // 2. ASR auto-generated track + auto-translate
  if (settings.enableAutoTranslateFallback) {
    const asrTrack = tracks.find((t) => t.kind === 'asr');
    if (asrTrack) {
      log.info(
        `✓ No human subs in "${target}". Using ASR track (lang="${asrTrack.languageCode}") ` +
        `with auto-translate → "${target}".`
      );
      player.setOption('captions', 'track', {
        languageCode: asrTrack.languageCode,
        vssId: asrTrack.vssId,
        translationLanguage: {
          languageName: settings.targetLanguageName || 'English',
          languageCode: settings.targetLanguage,
        },
      });
      log.groupEnd();
      return;
    }
    log.dim('No ASR track found. Trying any non-target track as last resort...');

    // Last resort
    const anyTrack = tracks.find((t) => t.languageCode?.toLowerCase() !== target);
    if (anyTrack) {
      log.info(
        `✓ Last resort: using track (lang="${anyTrack.languageCode}", kind="${anyTrack.kind ?? 'human'}") ` +
        `with auto-translate → "${target}".`
      );
      player.setOption('captions', 'track', {
        languageCode: anyTrack.languageCode,
        vssId: anyTrack.vssId,
        translationLanguage: {
          languageName: settings.targetLanguageName || 'English',
          languageCode: settings.targetLanguage,
        },
      });
      log.groupEnd();
      return;
    }

    log.warn('All tracks are already in the target language. Nothing to do.');
  } else {
    log.dim('Auto-translate fallback is disabled in settings. Skipping ASR tracks.');
  }

  log.warn('Could not select any subtitle track.');
  log.groupEnd();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

function getLanguageName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

async function handleNavigation() {
  const url = window.location.href;
  const videoId = getVideoId();

  // Only act on watch pages (not Shorts)
  if (!window.location.pathname.startsWith('/watch')) {
    log.dim(`Skipping non-watch page: ${window.location.pathname}`);
    return;
  }

  log.info(`▶ Navigation detected. URL: ${url} | Video ID: ${videoId}`);

  await loadSettings();

  // ── Language detection ────────────────────────────────────────────────────
  const detectedCode = detectVideoLanguage();

  if (!detectedCode) {
    log.warn(
      'Language detection returned null. ' +
      'Possible reasons: no caption tracks on this video, ' +
      'ytInitialPlayerResponse not yet available, or an unsupported page state. ' +
      'BabelTube will not act on this page.'
    );
    return;
  }

  const target = settings.targetLanguage.toLowerCase();
  log.info(`Detected language: "${detectedCode}" | Target language: "${target}"`);

  if (detectedCode === target) {
    log.info(`Video is already in the target language ("${target}"). Nothing to do.`);
    return;
  }

  const detectedName = getLanguageName(detectedCode);
  log.info(`Foreign-language video confirmed: "${detectedName}" (${detectedCode}) → translate to "${settings.targetLanguageName}" (${target}).`);

  // ── Banner ────────────────────────────────────────────────────────────────
  if (settings.showBanner) {
    if (isBannerDismissedForVideo(videoId)) {
      log.dim(`Banner already dismissed for video "${videoId}" this session. Skipping.`);
    } else {
      showBanner(detectedName);
    }
  } else {
    log.dim('Banner is disabled in settings.');
  }

  // ── Subtitle selection ────────────────────────────────────────────────────
  if (settings.enableSubtitles) {
    const player = await waitForPlayer();
    if (player) {
      await selectBestSubtitleTrack(player);
    } else {
      log.error(
        'Player element (#movie_player) never became ready with setOption. ' +
        'Subtitle selection skipped. This may happen if the player is slow to load or ' +
        'if YouTube changed their player structure.'
      );
    }
  } else {
    log.dim('Subtitle auto-selection is disabled in settings.');
  }

  log.info('▶ handleNavigation() complete.');
}

// ─── Entry points ─────────────────────────────────────────────────────────────

log.info('Content script loaded. Watching for YouTube watch pages...');

// Initial page load
handleNavigation();

// YouTube SPA navigation — fires on every video change
document.addEventListener('yt-navigate-finish', () => {
  log.dim('yt-navigate-finish event received. Re-running...');
  removeBanner();
  handleNavigation();
});

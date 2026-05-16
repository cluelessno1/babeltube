/**
 * BabelTube — youtube.js  (ISOLATED world)
 *
 * Receives YouTube page data from page-reader.js (MAIN world) via the
 * 'babeltube:page-data' CustomEvent, then:
 *  1. Detects the video's audio language.
 *  2. Shows the translation banner if the video is in a foreign language.
 *  3. Selects the best subtitle track via YouTube's player API.
 *
 * DEBUG: All decisions are logged under the [BabelTube] prefix.
 *        Open Chrome DevTools (F12) → Console on any YouTube watch page.
 *        Filter by "BabelTube" to isolate extension logs.
 *
 * NOTE: YouTube Shorts (youtube.com/shorts/) are intentionally excluded.
 * TODO: Shorts support (youtube.com/shorts/)
 */

'use strict';

function getLangUtils() {
  return globalThis.BabelTubeLang ?? (typeof window !== 'undefined' ? window.BabelTubeLang : null);
}

// ─── Debug logger ─────────────────────────────────────────────────────────────
// All log calls are gated on the DEBUG flag (except errors, which are always shown).
// Toggle debug mode via BabelTube Settings → "Debug mode".
// The flag is also written to document.documentElement.dataset.babeltubeDebug
// so that page-reader.js (MAIN world) can read it without chrome.storage access.

let DEBUG = false;

const LP  = '%c[BabelTube]';
const LS  = 'color:#ff4444;font-weight:bold';
const LD  = 'color:#888;font-weight:normal';

const log = {
  info:     (...a) => DEBUG && console.log(LP, LS, ...a),
  warn:     (...a) => DEBUG && console.warn(LP, LS, ...a),
  error:    (...a) => console.error(LP, LS, ...a),          // always visible
  dim:      (...a) => DEBUG && console.log(LP, LD, ...a),
  group:    (l)   => DEBUG && console.groupCollapsed(`[BabelTube] ${l}`),
  groupEnd: ()    => DEBUG && console.groupEnd(),
  table:    (d)   => DEBUG && (console.log(LP, LS, 'Table:'), console.table(d)),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BT_EVENT   = 'babeltube:page-data';
const BANNER_ID  = 'babeltube-banner';

// ─── Settings ─────────────────────────────────────────────────────────────────

let settings = {
  targetLanguage: 'en',
  targetLanguageName: 'English',
  showBanner: true,
  bannerDismissDuration: 10,
  enableSubtitles: true,
  enableAutoTranslateFallback: true,
};

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (items) => {
      settings = { ...settings, ...items };

      // Sync DEBUG flag and expose it on the DOM so page-reader.js can read it
      DEBUG = !!settings.debugMode;
      document.documentElement.dataset.babeltubeDebug = DEBUG ? '1' : '0';

      log.dim('Debug mode: ON');
      log.dim('Settings:', JSON.stringify(settings));
      resolve();
    });
  });
}

function syncPopupDataset(detectedCode, ambiguous, subtitleLabel) {
  const root = document.documentElement;
  root.dataset.babeltubeDetected = detectedCode ?? '';
  root.dataset.babeltubeAmbiguous = ambiguous ? '1' : '0';
  root.dataset.babeltubeSubtitleStatus = subtitleLabel ?? '';
}

// ─── Banner ───────────────────────────────────────────────────────────────────

function getVideoId() {
  return new URLSearchParams(window.location.search).get('v') ?? '';
}

function isBannerDismissed(videoId) {
  return sessionStorage.getItem(`babeltube_dismissed_${videoId}`) === '1';
}

function removeBanner() {
  document.getElementById(BANNER_ID)?.remove();
}

function showBanner(sourceLangName) {
  if (document.getElementById(BANNER_ID)) {
    log.dim('Banner already visible — skipping.');
    return;
  }

  const targetName = settings.targetLanguageName || 'English';
  const sourceName = sourceLangName || 'a foreign language';

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  Object.assign(banner.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999999',
    background: 'linear-gradient(90deg,#1a1a2e,#16213e)',
    color: '#eaeaea', fontFamily: "'Roboto',Arial,sans-serif", fontSize: '13px',
    padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,.5)', borderBottom: '2px solid #ff4444',
  });

  const logo = Object.assign(document.createElement('span'), { textContent: '🗼' });
  logo.style.fontSize = '16px';
  logo.setAttribute('aria-hidden', 'true');

  const msg = document.createElement('span');
  msg.style.flex = '1';
  msg.innerHTML =
    `<strong>BabelTube</strong> detected this video is in <strong>${sourceName}</strong>. ` +
    `Right-click anywhere on the page and choose <strong>"Translate to ${targetName}"</strong> to translate the page.`;

  const btn = document.createElement('button');
  btn.textContent = '✕';
  btn.title = 'Dismiss';
  Object.assign(btn.style, {
    background: 'transparent', border: 'none', color: '#aaa',
    cursor: 'pointer', fontSize: '14px', padding: '0 4px', flexShrink: '0',
  });
  btn.addEventListener('click', () => {
    log.dim('Banner dismissed by user.');
    sessionStorage.setItem(`babeltube_dismissed_${getVideoId()}`, '1');
    removeBanner();
  });

  banner.append(logo, msg, btn);
  document.body.prepend(banner);
  log.info(`Banner shown — video is "${sourceName}", target is "${targetName}".`);

  const secs = settings.bannerDismissDuration;
  if (secs > 0) {
    log.dim(`Auto-dismiss in ${secs}s.`);
    setTimeout(() => {
      banner.style.transition = 'opacity .5s';
      banner.style.opacity = '0';
      setTimeout(removeBanner, 500);
    }, secs * 1000);
  }
}

// ─── Subtitle selection ───────────────────────────────────────────────────────
// NOTE: player.setOption() is a YouTube JS method visible only in MAIN world.
// We cannot call it here (ISOLATED world). Instead we pick the best track and
// dispatch 'babeltube:select-track'; page-reader.js executes the actual call.

const SELECT_EVENT = 'babeltube:select-track';

function selectSubtitleTrack(captionTracks) {
  const target = settings.targetLanguage.toLowerCase();

  log.group('Subtitle selection');
  log.info(`${captionTracks.length} track(s) available, target: "${target}"`);
  log.table(captionTracks);

  if (!captionTracks.length) {
    log.warn('No caption tracks — cannot auto-select subtitles.');
    log.groupEnd();
    return;
  }

  let chosen = null;
  let reason = '';

  // 1. Human subtitle in target language (best quality)
  const humanTarget = captionTracks.find(
    (t) => t.languageCode?.toLowerCase() === target && t.kind !== 'asr'
  );
  if (humanTarget) {
    chosen = { languageCode: humanTarget.languageCode, vssId: humanTarget.vssId };
    reason = `Human subtitle found for "${target}"`;
  }

  // 2. ASR (auto-generated) track + auto-translate
  if (!chosen && settings.enableAutoTranslateFallback) {
    const asrTrack = captionTracks.find((t) => t.kind === 'asr');
    if (asrTrack) {
      chosen = {
        languageCode: asrTrack.languageCode,
        vssId: asrTrack.vssId,
        translationLanguage: {
          languageName: settings.targetLanguageName || 'English',
          languageCode: settings.targetLanguage,
        },
      };
      reason = `ASR track (lang="${asrTrack.languageCode}") + auto-translate → "${target}"`;
    }
  }

  // 3. Any non-target track + auto-translate (last resort)
  if (!chosen && settings.enableAutoTranslateFallback) {
    const anyOther = captionTracks.find((t) => t.languageCode?.toLowerCase() !== target);
    if (anyOther) {
      chosen = {
        languageCode: anyOther.languageCode,
        vssId: anyOther.vssId,
        translationLanguage: {
          languageName: settings.targetLanguageName || 'English',
          languageCode: settings.targetLanguage,
        },
      };
      reason = `Last resort: track (lang="${anyOther.languageCode}") + auto-translate → "${target}"`;
    }
  }

  if (!chosen) {
    log.warn('No suitable track found. All tracks may already be in the target language.');
    log.groupEnd();
    return;
  }

  log.info(`✓ ${reason}. Dispatching select-track to page-reader.js.`);
  log.dim('Track payload:', JSON.stringify(chosen));

  document.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: { track: chosen } }));
  log.groupEnd();
}

// ─── Language name helper ─────────────────────────────────────────────────────

function langName(code) {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code; }
  catch { return code; }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function handlePageData(pageData) {
  if (!window.location.pathname.startsWith('/watch')) {
    log.dim(`Not a watch page (${window.location.pathname}) — skipping.`);
    return;
  }

  const {
    videoId,
    captionTracks,
    audioTracks,
    defaultAudioTrackIndex,
    audioLanguageCode,
    playerAudioCode,
    adaptiveAudioCode,
    resolveSource,
    debugDump,
  } = pageData;
  const urlVideoId = getVideoId();

  log.info(
    `▶ Page data received. videoId: "${videoId}", URL: "${urlVideoId}"` +
    (resolveSource ? `, source: ${resolveSource}` : '')
  );

  // Stale event guard — videoId from data must match the current URL
  if (videoId && videoId !== urlVideoId) {
    log.warn(`Stale page-data event (data is for "${videoId}", URL is "${urlVideoId}"). Ignoring.`);
    return;
  }

  if (debugDump?.timedOut) {
    log.error(
      `page-reader.js timed out waiting for player response for "${debugDump.expectedVideoId}". ` +
      `getPlayerResponse id: "${debugDump.getPlayerResponseVideoId ?? 'none'}", ` +
      `ytIPR id: "${debugDump.actualVideoId ?? 'none'}". BabelTube cannot act on this video.`
    );
    log.dim('Debug dump:', JSON.stringify(debugDump, null, 2));
    syncPopupDataset(null, false, 'No captions');
    return;
  }

  await loadSettings();

  const target = settings.targetLanguage.toLowerCase();

  log.group('Language detection');
  log.dim('playerAudioCode:', playerAudioCode);
  log.dim('adaptiveAudioCode:', adaptiveAudioCode);
  log.dim('audioLanguageCode (microformat):', audioLanguageCode);
  if (captionTracks.length) log.table(captionTracks);

  const Lang = getLangUtils();
  if (!Lang) {
    log.error(
      'language-utils.js is not loaded in the isolated world. ' +
      'Reload BabelTube at chrome://extensions (Developer mode → Reload).'
    );
    log.groupEnd();
    return;
  }

  const detection = Lang.detectVideoLanguage({
    playerAudioCode,
    adaptiveAudioCode,
    audioLanguageCode,
    captionTracks,
    audioTracks,
    defaultAudioTrackIndex: defaultAudioTrackIndex ?? 0,
    targetLanguage: target,
  });
  log.groupEnd();

  const { code: detectedCode, ambiguous, method } = detection;
  log.info(`Detection result: method="${method}", code="${detectedCode ?? 'null'}", ambiguous=${ambiguous}`);

  const subtitleLabel = Lang.getSubtitleStatusLabel({
    captionTracks,
    enableSubtitles: settings.enableSubtitles !== false,
    detectedCode,
    targetLanguage: target,
    ambiguous,
  });
  syncPopupDataset(detectedCode, ambiguous, subtitleLabel);

  if (ambiguous) {
    log.warn(
      'Multiple human subtitle languages — cannot determine video language; ' +
      'applying target-language subtitles.'
    );
    if (settings.enableSubtitles) {
      selectSubtitleTrack(captionTracks);
    } else {
      log.dim('Subtitle selection disabled in settings.');
    }
    log.info('▶ Done (ambiguous).');
    return;
  }

  if (!detectedCode) {
    log.warn('Could not determine video language — no banner or subtitle changes.');
    log.dim('Debug dump:', JSON.stringify(debugDump, null, 2));
    return;
  }

  log.info(`Detected: "${detectedCode}" (${langName(detectedCode)}) | Target: "${target}" (${langName(target)})`);

  if (detectedCode === target) {
    log.info(`Already in target language. Nothing to do.`);
    return;
  }

  const sourceName = langName(detectedCode);
  log.info(`Foreign language confirmed — activating BabelTube.`);

  if (settings.showBanner) {
    if (isBannerDismissed(urlVideoId)) {
      log.dim(`Banner already dismissed for "${urlVideoId}" this session.`);
    } else {
      showBanner(sourceName);
    }
  } else {
    log.dim('Banner disabled in settings.');
  }

  if (settings.enableSubtitles) {
    selectSubtitleTrack(captionTracks);
  } else {
    log.dim('Subtitle selection disabled in settings.');
  }

  log.info('▶ Done.');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

// Always log startup — lets user confirm the extension is active even with debug off
console.log('%c[BabelTube]', 'color:#ff4444;font-weight:bold',
  'Loaded. Enable "Debug mode" in BabelTube Settings (⚙) to see detailed logs.');

document.addEventListener(BT_EVENT, (e) => {
  removeBanner(); // clear any banner from the previous video
  handlePageData(e.detail);
});

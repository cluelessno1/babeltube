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

// ─── Debug logger ─────────────────────────────────────────────────────────────

const LOG_PREFIX  = '%c[BabelTube]';
const LOG_STYLE   = 'color:#ff4444;font-weight:bold';
const LOG_DIM     = 'color:#888;font-weight:normal';

const log = {
  info:     (...a) => console.log(LOG_PREFIX, LOG_STYLE, ...a),
  warn:     (...a) => console.warn(LOG_PREFIX, LOG_STYLE, ...a),
  error:    (...a) => console.error(LOG_PREFIX, LOG_STYLE, ...a),
  dim:      (...a) => console.log(LOG_PREFIX, LOG_DIM, ...a),
  group:    (l)   => console.groupCollapsed(`[BabelTube] ${l}`),
  groupEnd: ()    => console.groupEnd(),
  table:    (d)   => { console.log(LOG_PREFIX, LOG_STYLE, 'Table:'); console.table(d); },
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BT_EVENT   = 'babeltube:page-data';
const BANNER_ID  = 'babeltube-banner';
const PLAYER_READY_POLL_MS    = 300;
const PLAYER_READY_TIMEOUT_MS = 15000;

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
      log.dim('Settings:', JSON.stringify(settings));
      resolve();
    });
  });
}

// ─── Language detection ───────────────────────────────────────────────────────

/**
 * Determines the video's audio language from the caption/audio track data
 * extracted by page-reader.js.
 *
 * Priority:
 *  1. audioTracks[defaultIndex] → resolve captionTrackIndices[0] → languageCode
 *  2. First non-ASR (human) captionTrack → languageCode
 *  3. First ASR captionTrack → languageCode
 */
function detectLanguage({ captionTracks, audioTracks, debugDump }) {
  log.group('Language detection');
  log.dim('Caption tracks received:', captionTracks.length);
  if (captionTracks.length) log.table(captionTracks);
  log.dim('Audio tracks received:', audioTracks.length);
  if (audioTracks.length) log.table(audioTracks);

  // ── Path 1: explicit audio track ────────────────────────────────────────
  if (audioTracks.length > 0) {
    const defaultIdx  = audioTracks[0].defaultCaptionTrackIndex ?? 0;
    const defaultTrack = audioTracks[defaultIdx] ?? audioTracks[0];
    const ctIdx = defaultTrack?.captionTrackIndices?.[0];
    if (ctIdx !== undefined && captionTracks[ctIdx]) {
      const code = captionTracks[ctIdx].languageCode?.toLowerCase();
      if (code) {
        log.info(`Language via audioTracks[${defaultIdx}] → captionTracks[${ctIdx}]: "${code}"`);
        log.groupEnd();
        return code;
      }
    }
    log.dim('audioTracks present but could not resolve a languageCode from captionTrackIndices.');
  }

  // ── Path 2: first human caption track ───────────────────────────────────
  const humanTrack = captionTracks.find((t) => t.kind !== 'asr');
  if (humanTrack) {
    const code = humanTrack.languageCode?.toLowerCase();
    log.info(`Language via first human captionTrack: "${code}" (name="${humanTrack.name}")`);
    log.groupEnd();
    return code ?? null;
  }

  // ── Path 3: first ASR track ──────────────────────────────────────────────
  const asrTrack = captionTracks.find((t) => t.kind === 'asr');
  if (asrTrack) {
    const code = asrTrack.languageCode?.toLowerCase();
    log.info(`Language via first ASR captionTrack: "${code}"`);
    log.groupEnd();
    return code ?? null;
  }

  log.warn(
    'No caption tracks at all. This video likely has hardcoded/burned-in subtitles. ' +
    'Language cannot be detected — BabelTube will not act.'
  );
  log.dim('Full debug dump from page-reader:', JSON.stringify(debugDump, null, 2));
  log.groupEnd();
  return null;
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

// ─── Player / subtitle selection ─────────────────────────────────────────────

function waitForPlayer() {
  return new Promise((resolve) => {
    const start = Date.now();
    log.dim('Waiting for #movie_player.setOption...');
    const poll = () => {
      const p = document.querySelector('#movie_player');
      if (p && typeof p.setOption === 'function') {
        log.dim(`Player ready after ${Date.now() - start}ms.`);
        resolve(p);
        return;
      }
      if (Date.now() - start > PLAYER_READY_TIMEOUT_MS) {
        log.warn(
          `Player not ready after ${PLAYER_READY_TIMEOUT_MS}ms. ` +
          `#movie_player exists: ${!!p}, setOption: ${typeof p?.setOption}`
        );
        resolve(null);
        return;
      }
      setTimeout(poll, PLAYER_READY_POLL_MS);
    };
    poll();
  });
}

async function selectSubtitleTrack(player, captionTracks) {
  const target = settings.targetLanguage.toLowerCase();

  log.group('Subtitle selection');
  log.info(`${captionTracks.length} track(s) available, target language: "${target}"`);
  log.table(captionTracks);

  if (!captionTracks.length) {
    log.warn('No caption tracks — cannot auto-select subtitles.');
    log.groupEnd();
    return;
  }

  // 1. Human subtitle in target language
  const humanTarget = captionTracks.find(
    (t) => t.languageCode?.toLowerCase() === target && t.kind !== 'asr'
  );
  if (humanTarget) {
    log.info(`✓ Human subtitle found for "${target}". Selecting it.`);
    player.setOption('captions', 'track', {
      languageCode: humanTarget.languageCode,
      vssId: humanTarget.vssId,
    });
    log.groupEnd();
    return;
  }
  log.dim(`No human subtitle in "${target}".`);

  if (!settings.enableAutoTranslateFallback) {
    log.dim('Auto-translate fallback disabled — stopping here.');
    log.groupEnd();
    return;
  }

  // 2. ASR track + auto-translate
  const asrTrack = captionTracks.find((t) => t.kind === 'asr');
  if (asrTrack) {
    log.info(`✓ ASR track found (lang="${asrTrack.languageCode}"). Enabling with auto-translate → "${target}".`);
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

  // 3. Any non-target track + auto-translate (last resort)
  const anyOther = captionTracks.find((t) => t.languageCode?.toLowerCase() !== target);
  if (anyOther) {
    log.info(`✓ Last resort: using track (lang="${anyOther.languageCode}") with auto-translate → "${target}".`);
    player.setOption('captions', 'track', {
      languageCode: anyOther.languageCode,
      vssId: anyOther.vssId,
      translationLanguage: {
        languageName: settings.targetLanguageName || 'English',
        languageCode: settings.targetLanguage,
      },
    });
    log.groupEnd();
    return;
  }

  log.warn('All tracks are already in the target language — nothing to auto-translate.');
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

  const { videoId, captionTracks, audioTracks, debugDump } = pageData;
  const urlVideoId = getVideoId();

  log.info(`▶ Page data received. videoId from data: "${videoId}", from URL: "${urlVideoId}"`);

  // Stale event guard — videoId from data must match the current URL
  if (videoId && videoId !== urlVideoId) {
    log.warn(`Stale page-data event (data is for "${videoId}", URL is "${urlVideoId}"). Ignoring.`);
    return;
  }

  if (debugDump?.timedOut) {
    log.error(
      `page-reader.js timed out waiting for ytInitialPlayerResponse for "${debugDump.expectedVideoId}". ` +
      `This video may have no ytInitialPlayerResponse at all (rare). ` +
      `BabelTube cannot act on this video.`
    );
    log.dim('Debug dump:', JSON.stringify(debugDump, null, 2));
    return;
  }

  await loadSettings();

  // ── Language detection ──────────────────────────────────────────────────
  const detectedCode = detectLanguage({ captionTracks, audioTracks, debugDump });

  if (!detectedCode) return; // already logged inside detectLanguage

  const target = settings.targetLanguage.toLowerCase();
  log.info(`Detected: "${detectedCode}" (${langName(detectedCode)}) | Target: "${target}" (${langName(target)})`);

  if (detectedCode === target) {
    log.info(`Already in target language. Nothing to do.`);
    return;
  }

  const sourceName = langName(detectedCode);
  log.info(`Foreign language confirmed — activating BabelTube.`);

  // ── Banner ──────────────────────────────────────────────────────────────
  if (settings.showBanner) {
    if (isBannerDismissed(urlVideoId)) {
      log.dim(`Banner already dismissed for "${urlVideoId}" this session.`);
    } else {
      showBanner(sourceName);
    }
  } else {
    log.dim('Banner disabled in settings.');
  }

  // ── Subtitles ───────────────────────────────────────────────────────────
  if (settings.enableSubtitles) {
    const player = await waitForPlayer();
    if (player) {
      await selectSubtitleTrack(player, captionTracks);
    } else {
      log.error(
        '#movie_player never exposed setOption. Subtitle selection skipped. ' +
        'YouTube may have changed their player structure.'
      );
    }
  } else {
    log.dim('Subtitle selection disabled in settings.');
  }

  log.info('▶ Done.');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

log.info('Isolated-world script loaded. Listening for babeltube:page-data events...');

document.addEventListener(BT_EVENT, (e) => {
  removeBanner(); // clear any banner from the previous video
  handlePageData(e.detail);
});

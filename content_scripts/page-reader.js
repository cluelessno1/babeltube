/**
 * BabelTube — page-reader.js  (MAIN world)
 *
 * Runs in the MAIN world (same JS context as YouTube's own scripts).
 * This is the ONLY script with access to window.ytInitialPlayerResponse
 * and other YouTube globals — isolated-world content scripts cannot see them.
 *
 * Responsibility:
 *  - Poll until ytInitialPlayerResponse is populated for the current video.
 *  - Serialize all useful YouTube page data (captions, audio tracks, config).
 *  - Dispatch a 'babeltube:page-data' CustomEvent so youtube.js can act on it.
 *  - Re-run on every yt-navigate-finish (YouTube SPA navigation).
 *
 * Debug logging: reads the data-babeltube-debug attribute set by youtube.js.
 *  Enable via: BabelTube settings → "Debug mode"
 */

'use strict';

// ─── Debug logger ─────────────────────────────────────────────────────────────
// Reads a DOM attribute written by youtube.js (isolated world) after it loads
// settings from chrome.storage. Checked lazily on each log call so it picks
// up setting changes without needing a page reload.

const isDebug = () => document.documentElement.dataset.babeltubeDebug === '1';

const rlog = {
  info:  (...a) => isDebug() && console.log('%c[BabelTube:reader]', 'color:#ff8844;font-weight:bold', ...a),
  warn:  (...a) => isDebug() && console.warn('%c[BabelTube:reader]', 'color:#ff8844;font-weight:bold', ...a),
  error: (...a) => console.error('%c[BabelTube:reader]', 'color:#ff8844;font-weight:bold', ...a), // always visible
  dim:   (...a) => isDebug() && console.log('%c[BabelTube:reader]', 'color:#886644;font-weight:normal', ...a),
};

// ─── Constants ────────────────────────────────────────────────────────────────

const BT_EVENT   = 'babeltube:page-data';
const POLL_MS    = 150;
const TIMEOUT_MS = 12000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentVideoId() {
  return new URLSearchParams(location.search).get('v') ?? null;
}

/**
 * Safe JSON serializer — avoids circular-reference crashes on large YT objects.
 */
function safeJson(obj) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }));
}

// ─── Data extraction ──────────────────────────────────────────────────────────

/**
 * Extracts everything BabelTube needs from ytInitialPlayerResponse plus a
 * comprehensive debug dump of all relevant YouTube globals.
 */
function extractPageData(ipr) {
  const Lang = globalThis.BabelTubeLang;
  if (!Lang) {
    rlog.error('BabelTubeLang not loaded in MAIN world — reload extension at chrome://extensions');
    return {
      videoId: ipr?.videoDetails?.videoId ?? null,
      captionTracks: [],
      audioTracks: [],
      defaultAudioTrackIndex: 0,
      audioLanguageCode: null,
      playerAudioCode: null,
      adaptiveAudioCode: null,
      debugDump: { babelTubeLangMissing: true },
    };
  }

  const renderer = ipr?.captions?.playerCaptionsTracklistRenderer ?? null;
  const cap = Lang.extractCaptionData(ipr);
  const playerAudioCode = Lang.normalizeLangCode(Lang.getPlayerAudioTrackCode());
  const adaptiveAudioCode = Lang.normalizeLangCode(Lang.getAdaptiveDefaultAudioCode(ipr));

  const { captionTracks, audioTracks, defaultAudioTrackIndex, audioLanguageCode } = cap;

  rlog.dim(
    `extractPageData — playerAudio: ${playerAudioCode ?? 'none'}, ` +
    `adaptive: ${adaptiveAudioCode ?? 'none'}, microformat: ${audioLanguageCode ?? 'none'}`
  );

  // ── Comprehensive debug dump ───────────────────────────────────────────────
  // Everything a developer might need to diagnose detection failures.
  const debugDump = {
    // Video identity
    videoId:       ipr?.videoDetails?.videoId,
    videoTitle:    ipr?.videoDetails?.title,
    author:        ipr?.videoDetails?.author,
    lengthSeconds: ipr?.videoDetails?.lengthSeconds,
    isLive:        ipr?.videoDetails?.isLiveContent,
    isPrivate:     ipr?.videoDetails?.isPrivate,
    isUnlisted:    ipr?.videoDetails?.isUnlisted,

    // Caption summary
    captionTrackCount:   captionTracks.length,
    audioTrackCount:     audioTracks.length,
    defaultAudioIndex:   renderer?.defaultAudioTrackIndex ?? null,
    translationLanguages: (renderer?.translationLanguages ?? [])
      .map((l) => `${l.languageName?.simpleText ?? '?'} (${l.languageCode})`),

    // ytcfg — YouTube's internal runtime config
    // Contains locale, country, experiment flags, API keys, login state, etc.
    ytcfg: (() => {
      try {
        const d = window.ytcfg?.data_ ?? {};
        return {
          HL:                  d.HL,        // host/interface language code
          GL:                  d.GL,        // country code
          LOGGED_IN:           d.LOGGED_IN,
          INNERTUBE_CLIENT_VERSION: d.INNERTUBE_CONTEXT_CLIENT_VERSION,
          INNERTUBE_API_KEY:   d.INNERTUBE_API_KEY ? '[present]' : '[absent]',
          EXPERIMENT_FLAGS:    d.EXPERIMENT_FLAGS,
          DELEGATED_SESSION_ID: d.DELEGATED_SESSION_ID ? '[present]' : '[absent]',
          // Potential language-related flags
          USER_LOCALE:         d.USER_LOCALE,
          CONTENT_PLAYBACK_CONTEXT: d.CONTENT_PLAYBACK_CONTEXT,
        };
      } catch (e) { return { error: String(e) }; }
    })(),

    // Other useful globals
    hasYtInitialData:            !!window.ytInitialData,
    hasYtInitialPlayerResponse:  !!window.ytInitialPlayerResponse,
    hasYtcfg:                    !!window.ytcfg,

    // Microformat — additional video metadata
    microformat: (() => {
      try {
        const m = ipr?.microformat?.playerMicroformatRenderer;
        return m ? {
          category:         m.category,
          publishDate:      m.publishDate,
          uploadDate:       m.uploadDate,
          defaultAudioLanguageISO639_1: m.defaultAudioLanguageISO639_1 ?? null,
          audioLanguage:    m.audioLanguage ?? null,
          availableCountries: m.availableCountries?.length
            ? `${m.availableCountries.length} countries`
            : '(none listed)',
        } : null;
      } catch { return null; }
    })(),

    // Streaming formats summary (useful to confirm video loaded correctly)
    streamingFormats: (() => {
      try {
        const sf = ipr?.streamingData?.formats ?? [];
        return sf.map((f) => ({ itag: f.itag, quality: f.quality, mimeType: f.mimeType?.split(';')[0] }));
      } catch { return []; }
    })(),

    // Full raw captionsRenderer — deepest level of caption debug data
    rawCaptionsRenderer: renderer ? safeJson(renderer) : null,
  };

  return {
    videoId: ipr.videoDetails?.videoId ?? null,
    captionTracks,
    audioTracks,
    defaultAudioTrackIndex,
    audioLanguageCode,
    playerAudioCode,
    adaptiveAudioCode,
    debugDump,
  };
}

// ─── Poll & dispatch ──────────────────────────────────────────────────────────

function pollAndDispatch(expectedVideoId) {
  const start = Date.now();
  rlog.info(`Polling for player response (videoId="${expectedVideoId}")...`);

  const tick = () => {
    const Lang = globalThis.BabelTubeLang;
    if (!Lang) {
      rlog.error('BabelTubeLang not loaded — reload extension');
      return;
    }
    const resolved = Lang.resolvePlayerResponse(expectedVideoId);
    const staleIpr = window.ytInitialPlayerResponse;
    const staleId = staleIpr?.videoDetails?.videoId;

    rlog.dim(
      `Poll tick — resolved: ${resolved?.source ?? 'none'}, ` +
      `resolvedId: "${resolved?.ipr?.videoDetails?.videoId ?? 'none'}", ` +
      `ytIPR id: "${staleId ?? 'none'}", expected: "${expectedVideoId}", ` +
      `elapsed: ${Date.now() - start}ms`
    );

    if (resolved?.ipr) {
      rlog.info(
        `Player response matched via ${resolved.source} after ${Date.now() - start}ms. Extracting data...`
      );
      const data = extractPageData(resolved.ipr);
      data.resolveSource = resolved.source;
      rlog.dim('Dispatching babeltube:page-data event with payload:', JSON.stringify({
        videoId: data.videoId,
        resolveSource: data.resolveSource,
        captionTrackCount: data.captionTracks.length,
        playerAudioCode: data.playerAudioCode,
        adaptiveAudioCode: data.adaptiveAudioCode,
      }));
      document.dispatchEvent(new CustomEvent(BT_EVENT, { detail: data }));
      return;
    }

    if (Date.now() - start > TIMEOUT_MS) {
      let getPlayerResponseId = null;
      try {
        const p = document.querySelector('#movie_player');
        if (p && typeof p.getPlayerResponse === 'function') {
          getPlayerResponseId = p.getPlayerResponse()?.videoDetails?.videoId ?? null;
        }
      } catch (_) { /* ignore */ }

      rlog.warn(
        `Timed out after ${TIMEOUT_MS}ms. ` +
        `getPlayerResponse id: "${getPlayerResponseId ?? 'none'}", ` +
        `ytIPR id: "${staleId ?? 'none'}", expected "${expectedVideoId}". ` +
        `Dispatching timeout event so youtube.js can log a helpful error.`
      );
      document.dispatchEvent(new CustomEvent(BT_EVENT, {
        detail: {
          videoId: null,
          captionTracks: [],
          audioTracks: [],
          defaultAudioTrackIndex: 0,
          audioLanguageCode: null,
          playerAudioCode: null,
          adaptiveAudioCode: null,
          debugDump: {
            timedOut: true,
            expectedVideoId,
            actualVideoId: staleId ?? null,
            getPlayerResponseVideoId: getPlayerResponseId,
            hasYtInitialPlayerResponse: !!staleIpr,
            ytcfg: (() => {
              try {
                const d = window.ytcfg?.data_ ?? {};
                return { HL: d.HL, GL: d.GL, LOGGED_IN: d.LOGGED_IN };
              } catch { return null; }
            })(),
            rawCaptionsRenderer: null,
          },
        },
      }));
      return;
    }

    setTimeout(tick, POLL_MS);
  };

  tick();
}

// ─── Subtitle selection (called from MAIN world) ─────────────────────────────
// youtube.js cannot call player.setOption() because setOption is a method added
// by YouTube's own JS and is invisible to isolated-world scripts.
// Instead youtube.js dispatches 'babeltube:select-track'; we execute it here.

const SELECT_EVENT   = 'babeltube:select-track';
const PLAYER_POLL_MS = 200;
const PLAYER_TIMEOUT = 15000;

/** Cached track for re-apply after YouTube ad → content transition */
let cachedTrack = null;
let cachedVideoId = null;
let adEdgePollerId = null;
let lastAdPlaying = null;
let skipListenerAttached = false;
let pipelineRunning = false;
/** After user skips an ad, ignore stale ad DOM for this long (runtime: isAdPlaying stayed true). */
let forceContentApplyUntil = 0;

function isElementVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0.01;
}

/** Returns which ad UI signals are currently active (used when debug mode is on). */
function getAdSignals() {
  const p = document.querySelector('#movie_player');
  const skip = document.querySelector(
    '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button'
  );
  const overlay = document.querySelector('.ytp-ad-player-overlay');
  const adText = document.querySelector('.ytp-ad-text, .ytp-ad-preview-text, .ytp-ad-duration-remaining');

  return {
    adShowing: !!p?.classList.contains('ad-showing'),
    adInterrupting: !!p?.classList.contains('ytp-ad-interrupting'),
    visibleSkip: isElementVisible(skip),
    visibleOverlay: isElementVisible(overlay),
    visibleAdText: isElementVisible(adText),
    forceContent: Date.now() < forceContentApplyUntil,
  };
}

function isAdPlaying() {
  if (Date.now() < forceContentApplyUntil) return false;

  const s = getAdSignals();
  const playing =
    s.adShowing ||
    s.adInterrupting ||
    s.visibleSkip ||
    s.visibleOverlay ||
    s.visibleAdText;

  if (playing) rlog.dim('isAdPlaying=true', s);

  return playing;
}

function markAdSkippedByUser() {
  forceContentApplyUntil = Date.now() + 12000;
  rlog.info('User skipped ad — treating as main content for 12s');
}

function stopAdEdgePoller() {
  if (adEdgePollerId) clearInterval(adEdgePollerId);
  adEdgePollerId = null;
  lastAdPlaying = null;
}

/**
 * Poll for ad → content transitions. Replaces onStateChange/MutationObserver
 * (runtime evidence: those never logged after ad skip in Incognito).
 */
function startAdEdgePoller() {
  if (adEdgePollerId) return;
  lastAdPlaying = isAdPlaying();
  rlog.dim(`Ad edge poller started (initial adPlaying=${lastAdPlaying}).`);

  adEdgePollerId = setInterval(async () => {
    if (!cachedTrack || !cachedVideoId) return;
    if (currentVideoId() !== cachedVideoId) return;

    const ad = isAdPlaying();

    if (lastAdPlaying === true && ad === false) {
      rlog.info('Ad ended — re-applying subtitles to main video (poller).');
      await applyAfterAdTransition();
    }

    lastAdPlaying = ad;
  }, 250);
}

/** Re-apply with staggered delays so the main-content player can finish initializing. */
async function applyAfterAdTransition({ force = false } = {}) {
  if (!cachedTrack) return;
  const delaysMs = [300, 800, 1500];
  for (let i = 0; i < delaysMs.length; i++) {
    await new Promise((r) => setTimeout(r, delaysMs[i]));
    if (!force && isAdPlaying()) {
      rlog.dim(`Re-apply attempt ${i} skipped — isAdPlaying still true`, getAdSignals());
      return;
    }
    const ok = await applyTrack(cachedTrack, force ? `after-skip-${i}` : `after-ad-${i}`);
    if (ok) {
      rlog.info(`Subtitles applied (attempt ${i}, force=${force})`);
      return;
    }
  }
}

/** Wait until pre-roll / mid-roll ad finishes before first apply. */
async function waitUntilNoAd(maxMs = 45000) {
  const start = Date.now();
  rlog.dim('Waiting for ad to finish...');
  while (Date.now() - start < maxMs) {
    if (Date.now() < forceContentApplyUntil) break;
    if (!isAdPlaying()) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const stillAd = isAdPlaying();
  rlog.dim('Ad wait finished', { stillAd, waitedMs: Date.now() - start });
  return !stillAd;
}

function attachSkipAdListener() {
  if (skipListenerAttached) return;
  skipListenerAttached = true;
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target?.closest?.(
        '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-ad-skip-button-container'
      );
      if (!el || !cachedTrack) return;
      markAdSkippedByUser();
      rlog.info('Skip-ad button clicked — force-applying subtitles');
      void applyAfterAdTransition({ force: true });
    },
    true
  );
  rlog.dim('Skip-ad click listener attached');
}

/**
 * Runtime evidence: on URL load, ads often start AFTER page-data/select-track,
 * so isAdPlaying() is false on first check and initial setOption targets the
 * ad player. Watch 5s for ad UI, then defer all applies until content plays.
 */
async function runSubtitlePipeline(track) {
  if (pipelineRunning) {
    rlog.dim('Pipeline already running — ignoring duplicate select-track');
    return;
  }
  pipelineRunning = true;

  try {
    rlog.dim('Subtitle pipeline started', { videoId: cachedVideoId, adNow: isAdPlaying() });

    startAdEdgePoller();
    attachSkipAdListener();

    const PRIME_MS = 5000;
    const primeStart = Date.now();
    let adSeenInPrime = isAdPlaying();

    while (Date.now() - primeStart < PRIME_MS) {
      if (isAdPlaying()) adSeenInPrime = true;
      await new Promise((r) => setTimeout(r, 200));
    }

    rlog.dim('Prime window complete', {
      adSeenInPrime,
      adNow: isAdPlaying(),
      primeMs: Date.now() - primeStart,
    });

    if (adSeenInPrime || isAdPlaying()) {
      rlog.info('Pre-roll ad detected — deferring subtitle apply until after ad');
      await waitUntilNoAd();
      await applyAfterAdTransition();
      return;
    }

    rlog.dim('No pre-roll ad — applying subtitles to main content');
    await applyTrack(track, 'initial');
  } finally {
    pipelineRunning = false;
  }
}

function waitForPlayerMain() {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      const p = document.querySelector('#movie_player');
      if (p && typeof p.setOption === 'function') {
        rlog.dim(`#movie_player.setOption ready after ${Date.now() - start}ms.`);
        resolve(p);
        return;
      }
      if (Date.now() - start > PLAYER_TIMEOUT) {
        rlog.error(
          `#movie_player never exposed setOption after ${PLAYER_TIMEOUT}ms. ` +
          `#movie_player in DOM: ${!!p}, typeof setOption: ${typeof p?.setOption}. ` +
          `YouTube may have changed their player structure.`
        );
        resolve(null);
        return;
      }
      setTimeout(poll, PLAYER_POLL_MS);
    };
    poll();
  });
}

async function applyTrack(track, reason) {
  const player = await waitForPlayerMain();
  if (!player) return false;

  const adDuringApply = isAdPlaying();
  rlog.info(`Applying track (${reason}), adPlaying=${adDuringApply}`);
  try {
    player.setOption('captions', 'track', track);
    rlog.info('player.setOption called successfully.');
    return true;
  } catch (err) {
    rlog.error('player.setOption threw an error:', err);
    return false;
  }
}

document.addEventListener(SELECT_EVENT, (e) => {
  const { track } = e.detail ?? {};
  if (!track) {
    rlog.warn('No track payload in select-track event — ignoring.');
    return;
  }

  cachedTrack = track;
  cachedVideoId = currentVideoId();
  stopAdEdgePoller();
  void runSubtitlePipeline(track);
});

// ─── Entry points ─────────────────────────────────────────────────────────────

rlog.info('page-reader.js loaded (MAIN world).');

// Initial hard page load
const initVideoId = currentVideoId();
if (initVideoId) {
  rlog.info(`Initial load — video ID: "${initVideoId}"`);
  pollAndDispatch(initVideoId);
} else {
  rlog.dim('No video ID in URL on initial load — not a watch page, skipping.');
}

// YouTube SPA navigation — fires on every in-page video change
document.addEventListener('yt-navigate-finish', () => {
  const vid = currentVideoId();
  rlog.info(`yt-navigate-finish — new video ID: "${vid ?? 'none'}"`);
  cachedTrack = null;
  cachedVideoId = null;
  forceContentApplyUntil = 0;
  stopAdEdgePoller();
  if (vid) pollAndDispatch(vid);
});

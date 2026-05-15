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
  const renderer = ipr?.captions?.playerCaptionsTracklistRenderer ?? null;

  // Caption tracks — only the fields we use downstream
  const captionTracks = (renderer?.captionTracks ?? []).map((t) => ({
    languageCode:   t.languageCode,
    kind:           t.kind,          // 'asr' = auto-generated; absent = human
    vssId:          t.vssId,
    name:           t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? null,
    isTranslatable: t.isTranslatable ?? false,
  }));

  // Audio tracks — used to resolve default audio language on multi-dub videos
  const audioTracks = (renderer?.audioTracks ?? []).map((at, idx) => ({
    index:                  idx,
    captionTrackIndices:    at.captionTrackIndices ?? [],
    defaultCaptionTrackIndex: renderer?.defaultAudioTrackIndex ?? 0,
  }));

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
    videoId:      ipr.videoDetails?.videoId ?? null,
    captionTracks,
    audioTracks,
    debugDump,
  };
}

// ─── Poll & dispatch ──────────────────────────────────────────────────────────

function pollAndDispatch(expectedVideoId) {
  const start = Date.now();
  rlog.info(`Polling for ytInitialPlayerResponse (videoId="${expectedVideoId}")...`);

  const tick = () => {
    const ipr = window.ytInitialPlayerResponse;
    const actualId = ipr?.videoDetails?.videoId;

    rlog.dim(`Poll tick — ytIPR videoId: "${actualId ?? 'none'}", expected: "${expectedVideoId}", elapsed: ${Date.now() - start}ms`);

    if (ipr && actualId === expectedVideoId) {
      rlog.info(`ytInitialPlayerResponse matched after ${Date.now() - start}ms. Extracting data...`);
      const data = extractPageData(ipr);
      rlog.dim('Dispatching babeltube:page-data event with payload:', JSON.stringify({
        videoId: data.videoId,
        captionTrackCount: data.captionTracks.length,
        audioTrackCount: data.audioTracks.length,
      }));
      document.dispatchEvent(new CustomEvent(BT_EVENT, { detail: data }));
      return;
    }

    if (Date.now() - start > TIMEOUT_MS) {
      rlog.warn(
        `Timed out after ${TIMEOUT_MS}ms. ` +
        `ytIPR videoId is "${actualId ?? 'none'}", expected "${expectedVideoId}". ` +
        `Dispatching timeout event so youtube.js can log a helpful error.`
      );
      document.dispatchEvent(new CustomEvent(BT_EVENT, {
        detail: {
          videoId: null,
          captionTracks: [],
          audioTracks: [],
          debugDump: {
            timedOut: true,
            expectedVideoId,
            actualVideoId: actualId ?? null,
            hasYtInitialPlayerResponse: !!ipr,
            // Dump ytcfg even on timeout — useful for diagnosing why IPR never appeared
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

// #region agent log
const DBG_INGEST = 'http://127.0.0.1:7537/ingest/9467374b-82f9-495a-8d7f-15e13322551a';
function dbgLog(hypothesisId, location, message, data = {}) {
  fetch(DBG_INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c97cd0' },
    body: JSON.stringify({
      sessionId: 'c97cd0', hypothesisId, location, message, data, timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

/** Cached track for re-apply after YouTube ad → content transition */
let cachedTrack = null;
let cachedVideoId = null;
let adEdgePollerId = null;
let lastAdPlaying = null;
let skipListenerAttached = false;
let pipelineRunning = false;

/** Always visible — critical ad/subtitle pipeline steps (not gated on debug mode). */
function pipelineLog(message, data) {
  if (data !== undefined) {
    console.log('%c[BabelTube:reader]', 'color:#ff8844;font-weight:bold', message, data);
  } else {
    console.log('%c[BabelTube:reader]', 'color:#ff8844;font-weight:bold', message);
  }
  // #region agent log
  dbgLog('F', 'page-reader.js:pipeline', message, data ?? {});
  // #endregion
}

/**
 * Detect whether a YouTube ad is currently interrupting playback.
 * Runtime evidence: initial setOption ran with adPlaying=true and did not
 * persist after skip — we must not treat "apply during ad" as success.
 */
function isAdPlaying() {
  const p = document.querySelector('#movie_player');
  if (!p) return false;
  if (p.classList.contains('ad-showing')) return true;
  if (p.classList.contains('ytp-ad-interrupting')) return true;
  if (p.classList.contains('ytp-ad-overlay-open')) return true;
  if (document.querySelector('.ytp-ad-player-overlay, .ytp-ad-module')) return true;
  if (document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')) {
    return true;
  }
  return false;
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
      // #region agent log
      dbgLog('A', 'page-reader.js:adEdgePoller', 'ad→content edge detected', {
        videoId: cachedVideoId,
      });
      // #endregion
      rlog.info('Ad ended — re-applying subtitles to main video (poller).');
      await applyAfterAdTransition();
    }

    lastAdPlaying = ad;
  }, 250);
}

/** Re-apply with staggered delays so the main-content player can finish initializing. */
async function applyAfterAdTransition() {
  if (!cachedTrack) return;
  const delaysMs = [400, 1000, 2000];
  for (let i = 0; i < delaysMs.length; i++) {
    await new Promise((r) => setTimeout(r, delaysMs[i]));
    if (isAdPlaying()) {
      rlog.dim(`Re-apply attempt ${i} skipped — ad still playing.`);
      return;
    }
    const ok = await applyTrack(cachedTrack, `after-ad-${i}`);
    // #region agent log
    dbgLog('A', 'page-reader.js:applyAfterAdTransition', `attempt ${i}`, { ok, ad: isAdPlaying() });
    // #endregion
    if (ok) rlog.info(`Subtitles applied after ad (attempt ${i}).`);
  }
}

/** Wait until pre-roll / mid-roll ad finishes before first apply. */
async function waitUntilNoAd(maxMs = 45000) {
  const start = Date.now();
  pipelineLog('Waiting for ad to finish...');
  while (isAdPlaying() && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const stillAd = isAdPlaying();
  pipelineLog('Ad wait finished', { stillAd, waitedMs: Date.now() - start });
  // #region agent log
  dbgLog('B', 'page-reader.js:waitUntilNoAd', 'wait finished', {
    stillAd, waitedMs: Date.now() - start,
  });
  // #endregion
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
      pipelineLog('Skip-ad button clicked — re-applying subtitles');
      void applyAfterAdTransition();
    },
    true
  );
  pipelineLog('Skip-ad click listener attached');
}

/**
 * Runtime evidence: on URL load, ads often start AFTER page-data/select-track,
 * so isAdPlaying() is false on first check and initial setOption targets the
 * ad player. Watch 5s for ad UI, then defer all applies until content plays.
 */
async function runSubtitlePipeline(track) {
  if (pipelineRunning) {
    pipelineLog('Pipeline already running — ignoring duplicate select-track');
    return;
  }
  pipelineRunning = true;

  try {
    pipelineLog('Subtitle pipeline started', {
      videoId: cachedVideoId,
      adNow: isAdPlaying(),
    });

    startAdEdgePoller();
    attachSkipAdListener();

    const PRIME_MS = 5000;
    const primeStart = Date.now();
    let adSeenInPrime = isAdPlaying();

    while (Date.now() - primeStart < PRIME_MS) {
      if (isAdPlaying()) adSeenInPrime = true;
      await new Promise((r) => setTimeout(r, 200));
    }

    pipelineLog('Prime window complete', {
      adSeenInPrime,
      adNow: isAdPlaying(),
      primeMs: Date.now() - primeStart,
    });

    if (adSeenInPrime || isAdPlaying()) {
      pipelineLog('Pre-roll ad detected — deferring subtitle apply until after ad');
      await waitUntilNoAd();
      await applyAfterAdTransition();
      pipelineLog('Pipeline finished (post-ad path)');
      return;
    }

    pipelineLog('No pre-roll ad — applying subtitles to main content');
    await applyTrack(track, 'initial');
    pipelineLog('Pipeline finished (direct path)');
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
  // #region agent log
  dbgLog('B', 'page-reader.js:applyTrack', 'setOption attempt', {
    reason, adDuringApply, videoId: cachedVideoId,
    trackLang: track.languageCode,
  });
  // #endregion

  rlog.info(`Applying track (${reason}), adPlaying=${adDuringApply}`);
  try {
    player.setOption('captions', 'track', track);
    rlog.info('player.setOption called successfully.');
    // #region agent log
    dbgLog('D', 'page-reader.js:applyTrack', 'setOption success', { reason, adDuringApply });
    // #endregion
    return true;
  } catch (err) {
    rlog.error('player.setOption threw an error:', err);
    // #region agent log
    dbgLog('D', 'page-reader.js:applyTrack', 'setOption error', { reason, error: String(err) });
    // #endregion
    return false;
  }
}

document.addEventListener(SELECT_EVENT, (e) => {
  const { track } = e.detail ?? {};
  pipelineLog('select-track event received', { hasTrack: !!track });

  if (!track) {
    rlog.warn('No track payload in select-track event — ignoring.');
    return;
  }

  const vid = currentVideoId();
  cachedTrack = track;
  cachedVideoId = vid;
  stopAdEdgePoller();

  // #region agent log
  dbgLog('A', 'page-reader.js:select-track', 'track cached', {
    videoId: vid, trackLang: track.languageCode, hasTranslation: !!track.translationLanguage,
  });
  // #endregion

  void runSubtitlePipeline(track);
});

// ─── Entry points ─────────────────────────────────────────────────────────────

console.log('[BabelTube:reader] MAIN world script loaded (page-reader.js)');
rlog.info('page-reader.js loaded (MAIN world). YouTube globals are accessible.');

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
  stopAdEdgePoller();
  if (vid) pollAndDispatch(vid);
});

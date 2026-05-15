/**
 * BabelTube — page-reader.js
 *
 * Runs in the MAIN world (same JS context as YouTube's own scripts).
 * This gives it access to window.ytInitialPlayerResponse and other YouTube
 * globals that are invisible to isolated-world content scripts.
 *
 * Responsibility:
 *  - Poll until ytInitialPlayerResponse is populated for the current video.
 *  - Serialize all useful YouTube page data and dispatch a CustomEvent that
 *    the isolated-world script (youtube.js) can receive via the DOM.
 *  - Re-run on every yt-navigate-finish (YouTube SPA navigation).
 *
 * Event dispatched: 'babeltube:page-data'
 *  detail: { videoId, captionTracks, audioTracks, debugDump }
 */

'use strict';

const BT_EVENT  = 'babeltube:page-data';
const POLL_MS   = 150;
const TIMEOUT_MS = 12000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentVideoId() {
  return new URLSearchParams(location.search).get('v') ?? null;
}

/**
 * Safely stringify — avoids circular-reference crashes on large YT objects.
 */
function safeJson(obj, maxDepth = 4) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(obj, function replacer(key, value) {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
    }
    return value;
  }));
}

// ─── Data extraction ──────────────────────────────────────────────────────────

function extractPageData(ipr) {
  const captionsRenderer = ipr?.captions?.playerCaptionsTracklistRenderer ?? null;

  // Clean caption tracks — only the fields we actually use
  const captionTracks = (captionsRenderer?.captionTracks ?? []).map((t) => ({
    languageCode:    t.languageCode,
    kind:            t.kind,           // 'asr' = auto-generated, absent = human
    vssId:           t.vssId,
    name:            t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? null,
    isTranslatable:  t.isTranslatable,
  }));

  const audioTracks = (captionsRenderer?.audioTracks ?? []).map((at, idx) => ({
    index:                idx,
    captionTrackIndices:  at.captionTrackIndices,
    defaultCaptionTrackIndex: captionsRenderer.defaultAudioTrackIndex,
  }));

  // ── Debug dump: every interesting YouTube global ──────────────────────────
  const debugDump = {
    // Core video metadata
    videoId:        ipr?.videoDetails?.videoId,
    videoTitle:     ipr?.videoDetails?.title,
    author:         ipr?.videoDetails?.author,
    isLive:         ipr?.videoDetails?.isLiveContent,
    isPrivate:      ipr?.videoDetails?.isPrivate,
    lengthSeconds:  ipr?.videoDetails?.lengthSeconds,

    // Captions summary
    captionTrackCount:  captionTracks.length,
    audioTrackCount:    audioTracks.length,
    defaultAudioTrackIndex: captionsRenderer?.defaultAudioTrackIndex ?? null,
    translationLanguages: (captionsRenderer?.translationLanguages ?? [])
      .map((l) => `${l.languageName?.simpleText} (${l.languageCode})`),

    // ytcfg (YouTube's internal config — locale, experiment flags, etc.)
    ytcfg: (() => {
      try {
        const cfg = window.ytcfg?.data_ ?? {};
        return {
          HL:          cfg.HL,        // host language
          GL:          cfg.GL,        // country
          INNERTUBE_CONTEXT_CLIENT_VERSION: cfg.INNERTUBE_CONTEXT_CLIENT_VERSION,
          LOGGED_IN:   cfg.LOGGED_IN,
          EXPERIMENT_FLAGS: cfg.EXPERIMENT_FLAGS,
        };
      } catch { return null; }
    })(),

    // ytInitialData presence
    hasYtInitialData:           !!window.ytInitialData,
    hasYtInitialPlayerResponse: !!window.ytInitialPlayerResponse,

    // Full captionsRenderer for deep inspection
    rawCaptionsRenderer: captionsRenderer ? safeJson(captionsRenderer) : null,
  };

  return { videoId: ipr.videoDetails?.videoId, captionTracks, audioTracks, debugDump };
}

// ─── Poll & dispatch ──────────────────────────────────────────────────────────

function pollAndDispatch(expectedVideoId) {
  const start = Date.now();

  const tick = () => {
    const ipr = window.ytInitialPlayerResponse;

    if (ipr && ipr.videoDetails?.videoId === expectedVideoId) {
      const data = extractPageData(ipr);
      document.dispatchEvent(new CustomEvent(BT_EVENT, { detail: data }));
      return;
    }

    if (Date.now() - start > TIMEOUT_MS) {
      // Dispatch anyway with whatever is available so youtube.js can log it
      document.dispatchEvent(new CustomEvent(BT_EVENT, {
        detail: {
          videoId: null,
          captionTracks: [],
          audioTracks: [],
          debugDump: {
            timedOut: true,
            expectedVideoId,
            actualVideoId: window.ytInitialPlayerResponse?.videoDetails?.videoId ?? null,
            hasYtInitialPlayerResponse: !!window.ytInitialPlayerResponse,
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

// ─── Entry points ─────────────────────────────────────────────────────────────

// Initial hard load
const initVideoId = currentVideoId();
if (initVideoId) pollAndDispatch(initVideoId);

// SPA navigation
document.addEventListener('yt-navigate-finish', () => {
  const vid = currentVideoId();
  if (vid) pollAndDispatch(vid);
});

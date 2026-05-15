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

// ─── Entry points ─────────────────────────────────────────────────────────────

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
  if (vid) pollAndDispatch(vid);
});

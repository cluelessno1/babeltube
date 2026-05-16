/**
 * BabelTube — language-utils.js
 * Shared language detection (no chrome.* APIs). Loaded in MAIN + ISOLATED worlds.
 *
 * All helpers are scoped inside an IIFE to avoid name collisions with
 * page-reader.js and youtube.js which run in the same JS world.
 * The public API is exported via globalThis.BabelTubeLang only.
 */
'use strict';

(function () {
  /** ISO 639 codes that are not a real content language */
  const INVALID_LANG_CODES = new Set([
    'und', 'zxx', 'mis', 'mul', 'qaa', 'qad', 'qub', 'unknown',
  ]);

  const LP = '%c[BabelTube:lang]';
  const LS = 'color:#cc8844;font-weight:bold';
  const LD = 'color:#886644;font-weight:normal';

  function isDebug() {
    return (
      typeof document !== 'undefined' &&
      document.documentElement?.dataset?.babeltubeDebug === '1'
    );
  }

  function logInfo(...a) {
    if (isDebug()) console.log(LP, LS, ...a);
  }

  function logDim(...a) {
    if (isDebug()) console.log(LP, LD, ...a);
  }

  function logWarn(...a) {
    if (isDebug()) console.warn(LP, LS, ...a);
  }

  function logGroup(label) {
    if (isDebug()) console.groupCollapsed(`[BabelTube:lang] ${label}`);
  }

  function logGroupEnd() {
    if (isDebug()) console.groupEnd();
  }

  function normalizeLangCode(raw) {
    if (raw == null || raw === '') return null;
    const part = String(raw).toLowerCase().split(/[-_.]/)[0];
    if (part.length < 2) return null;
    if (INVALID_LANG_CODES.has(part)) {
      logDim(`normalizeLangCode: ignoring non-language code "${part}"`);
      return null;
    }
    return part;
  }

  function getWatchVideoIdFromUrl() {
    return new URLSearchParams(location.search).get('v') ?? null;
  }

  function getMoviePlayer() {
    return document.querySelector('#movie_player');
  }

  function getPlayerAudioTrackCode() {
    const player = getMoviePlayer();
    if (!player || typeof player.getAudioTrack !== 'function') {
      logDim('getAudioTrack: not available on #movie_player');
      return null;
    }
    try {
      const track = player.getAudioTrack();
      if (!track || typeof track.getLanguageInfo !== 'function') {
        logDim('getAudioTrack: no track or getLanguageInfo');
        return null;
      }
      const info = track.getLanguageInfo();
      const code = normalizeLangCode(info?.id);
      if (code) {
        logInfo(`getAudioTrack → "${code}" (name="${info?.name ?? ''}")`);
      }
      return code;
    } catch (e) {
      logWarn('getAudioTrack error:', e);
      return null;
    }
  }

  function getAdaptiveDefaultAudioCode(ipr) {
    if (!ipr) return null;
    const formats = ipr.streamingData?.adaptiveFormats ?? [];
    const def = formats.find((f) => f?.audioTrack?.audioIsDefault === true);
    if (!def?.audioTrack) {
      logDim('adaptiveFormats: no default audioTrack');
      return null;
    }
    const code = normalizeLangCode(def.audioTrack.id);
    if (code) {
      logInfo(
        `adaptiveFormats default → "${code}" (display="${def.audioTrack.displayName ?? ''}")`
      );
    }
    return code;
  }

  function resolvePlayerResponse(expectedVideoId) {
    const player = getMoviePlayer();

    if (player && typeof player.getPlayerResponse === 'function') {
      try {
        const pr = player.getPlayerResponse();
        const id = pr?.videoDetails?.videoId;
        logDim(`getPlayerResponse() videoId="${id ?? 'none'}"`);
        if (pr && id === expectedVideoId) {
          logInfo(`resolvePlayerResponse: using getPlayerResponse for "${expectedVideoId}"`);
          return { ipr: pr, source: 'getPlayerResponse' };
        }
      } catch (e) {
        logWarn('getPlayerResponse() error:', e);
      }
    } else {
      logDim('getPlayerResponse: not available');
    }

    const ipr = typeof window !== 'undefined' ? window.ytInitialPlayerResponse : null;
    const id = ipr?.videoDetails?.videoId;
    logDim(`ytInitialPlayerResponse videoId="${id ?? 'none'}"`);
    if (ipr && id === expectedVideoId) {
      logInfo(`resolvePlayerResponse: using ytInitialPlayerResponse for "${expectedVideoId}"`);
      return { ipr, source: 'ytInitialPlayerResponse' };
    }

    return null;
  }

  function extractCaptionData(ipr) {
    const renderer = ipr?.captions?.playerCaptionsTracklistRenderer ?? null;

    const captionTracks = (renderer?.captionTracks ?? []).map((t) => ({
      languageCode: t.languageCode,
      kind: t.kind,
      vssId: t.vssId,
      name: t.name?.simpleText ?? t.name?.runs?.[0]?.text ?? null,
      isTranslatable: t.isTranslatable ?? false,
    }));

    const audioTracks = (renderer?.audioTracks ?? []).map((at, idx) => ({
      index: idx,
      captionTrackIndices: at.captionTrackIndices ?? [],
    }));

    const mf = ipr?.microformat?.playerMicroformatRenderer;
    const audioLanguageCode = normalizeLangCode(
      mf?.defaultAudioLanguageISO639_1 ?? mf?.audioLanguage
    );

    return {
      captionTracks,
      audioTracks,
      defaultAudioTrackIndex: renderer?.defaultAudioTrackIndex ?? 0,
      audioLanguageCode,
    };
  }

  function detectVideoLanguage(opts) {
    const {
      playerAudioCode: rawPlayerAudio = null,
      adaptiveAudioCode: rawAdaptive = null,
      audioLanguageCode: rawMicro = null,
      captionTracks = [],
      audioTracks = [],
      defaultAudioTrackIndex = 0,
      targetLanguage = 'en',
    } = opts;

    const playerAudioCode = normalizeLangCode(rawPlayerAudio);
    const adaptiveAudioCode = normalizeLangCode(rawAdaptive);
    const audioLanguageCode = normalizeLangCode(rawMicro);

    const target = (targetLanguage || 'en').toLowerCase();

    logGroup('detectVideoLanguage');
    logDim('targetLanguage:', target);
    logDim('playerAudioCode:', playerAudioCode, rawPlayerAudio !== playerAudioCode ? `(raw: ${rawPlayerAudio})` : '');
    logDim('adaptiveAudioCode:', adaptiveAudioCode);
    logDim('microformat audioLanguageCode:', audioLanguageCode);
    logDim('captionTracks:', captionTracks.length, 'audioTracks:', audioTracks.length);

    if (playerAudioCode) {
      logInfo(`✓ method: getAudioTrack → "${playerAudioCode}"`);
      logGroupEnd();
      return { code: playerAudioCode, ambiguous: false, method: 'getAudioTrack' };
    }

    if (adaptiveAudioCode) {
      logInfo(`✓ method: adaptiveFormats → "${adaptiveAudioCode}"`);
      logGroupEnd();
      return { code: adaptiveAudioCode, ambiguous: false, method: 'adaptiveFormats' };
    }

    if (audioLanguageCode) {
      logInfo(`✓ method: microformat → "${audioLanguageCode}"`);
      logGroupEnd();
      return { code: audioLanguageCode, ambiguous: false, method: 'microformat' };
    }

    if (audioTracks.length > 0 && captionTracks.length > 0) {
      const idx = defaultAudioTrackIndex ?? 0;
      const at = audioTracks[idx] ?? audioTracks[0];
      const ctIdx = at?.captionTrackIndices?.[0];
      if (ctIdx !== undefined && captionTracks[ctIdx]) {
        const code = normalizeLangCode(captionTracks[ctIdx].languageCode);
        if (code) {
          logInfo(`✓ method: captionDefaultAudio [${idx}]→caption[${ctIdx}] → "${code}"`);
          logGroupEnd();
          return { code, ambiguous: false, method: 'captionDefaultAudio' };
        }
      }
    }

    const human = captionTracks.filter((t) => t.kind !== 'asr');

    if (human.length === 1) {
      const code = normalizeLangCode(human[0].languageCode);
      logInfo(`✓ method: singleHumanCaption → "${code}"`);
      logGroupEnd();
      return { code, ambiguous: false, method: 'singleHumanCaption' };
    }

    if (human.length > 1) {
      const langs = [
        ...new Set(
          human.map((t) => normalizeLangCode(t.languageCode)).filter(Boolean)
        ),
      ];
      logDim(`human captions: ${human.length} track(s), distinct langs: [${langs.join(', ')}]`);

      if (langs.length > 1) {
        logWarn('✓ method: ambiguousHumanCaptions — multiple human subtitle languages');
        logGroupEnd();
        return { code: null, ambiguous: true, method: 'ambiguousHumanCaptions' };
      }

      if (langs.length === 1) {
        logInfo(`✓ method: sharedHumanCaptionLang → "${langs[0]}"`);
        logGroupEnd();
        return { code: langs[0], ambiguous: false, method: 'sharedHumanCaptionLang' };
      }
    }

    const asr = captionTracks.find((t) => t.kind === 'asr');
    if (asr) {
      const code = normalizeLangCode(asr.languageCode);
      logInfo(`✓ method: asr → "${code}"`);
      logGroupEnd();
      return { code, ambiguous: false, method: 'asr' };
    }

    logWarn('✓ method: unknown — could not determine language');
    logGroupEnd();
    return { code: null, ambiguous: false, method: 'unknown' };
  }

  function getSubtitleStatusLabel(opts) {
    const {
      captionTracks = [],
      enableSubtitles = true,
      detectedCode = null,
      targetLanguage = 'en',
      ambiguous = false,
    } = opts;

    const target = (targetLanguage || 'en').toLowerCase();

    if (enableSubtitles === false) return 'Disabled';
    if (ambiguous) return 'Opening subtitles in target language';
    if (detectedCode && detectedCode === target) {
      return 'Already in target language. No action performed.';
    }

    const hasHumanTarget = captionTracks.some(
      (t) => t.kind !== 'asr' && normalizeLangCode(t.languageCode) === target
    );
    if (hasHumanTarget) return 'Human subs ✓';

    const hasHuman = captionTracks.some((t) => t.kind !== 'asr');
    if (hasHuman) return 'Human subs available';

    if (captionTracks.some((t) => t.kind === 'asr')) return 'Auto-translate';

    return 'No captions';
  }

  globalThis.BabelTubeLang = {
    normalizeLangCode,
    getWatchVideoIdFromUrl,
    getMoviePlayer,
    getPlayerAudioTrackCode,
    getAdaptiveDefaultAudioCode,
    resolvePlayerResponse,
    extractCaptionData,
    detectVideoLanguage,
    getSubtitleStatusLabel,
  };
})();

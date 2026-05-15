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
 * NOTE: YouTube Shorts (youtube.com/shorts/) are intentionally excluded.
 * TODO: Shorts support (youtube.com/shorts/)
 */

'use strict';

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
 *  2. videoDetails.defaultAudioTrackIndex / playerConfig.audioConfig
 *  3. The first captionTrack's languageCode as a proxy for the audio language
 */
function detectVideoLanguage() {
  try {
    const ipr = window.ytInitialPlayerResponse;
    if (!ipr) return null;

    // Multi-audio-track videos expose audio language directly
    const audioTracks =
      ipr?.captions?.playerCaptionsTracklistRenderer?.audioTracks;
    if (audioTracks && audioTracks.length > 0) {
      const defaultIdx = ipr.captions.playerCaptionsTracklistRenderer
        .defaultAudioTrackIndex ?? 0;
      const track = audioTracks[defaultIdx] ?? audioTracks[0];
      const langCode = track?.captionTrackIndices?.[0] !== undefined
        ? ipr.captions.playerCaptionsTracklistRenderer.captionTracks?.[
            track.captionTrackIndices[0]
          ]?.languageCode
        : null;
      if (langCode) return langCode.toLowerCase();
    }

    // Fall back: infer from the default/first caption track
    const captionTracks =
      ipr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (captionTracks && captionTracks.length > 0) {
      // Non-ASR (human) tracks are more reliable indicators of the content language
      const humanTrack = captionTracks.find((t) => t.kind !== 'asr');
      const track = humanTrack ?? captionTracks[0];
      return track.languageCode?.toLowerCase() ?? null;
    }
  } catch (e) {
    // ytInitialPlayerResponse structure varies; fail gracefully
  }
  return null;
}

/**
 * Returns all available caption tracks from ytInitialPlayerResponse.
 */
function getCaptionTracks() {
  try {
    return (
      window.ytInitialPlayerResponse?.captions
        ?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    );
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
  if (document.getElementById(BANNER_ID)) return; // already visible

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

  // Logo/icon text
  const logo = document.createElement('span');
  logo.textContent = '🗼';
  logo.style.fontSize = '16px';
  logo.setAttribute('aria-hidden', 'true');

  // Message
  const msg = document.createElement('span');
  msg.style.flex = '1';
  msg.innerHTML =
    `<strong>BabelTube</strong> detected this video is in <strong>${sourceName}</strong>. ` +
    `Right-click anywhere on the page and select <strong>"Translate to ${targetName}"</strong> to translate the page using Chrome.`;

  // Dismiss button
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
    markBannerDismissed(getVideoId());
    removeBanner();
  });

  banner.appendChild(logo);
  banner.appendChild(msg);
  banner.appendChild(btn);
  document.body.prepend(banner);

  // Auto-dismiss
  const duration = settings.bannerDismissDuration;
  if (duration > 0) {
    setTimeout(() => {
      banner.style.transition = 'opacity 0.5s ease';
      banner.style.opacity = '0';
      setTimeout(removeBanner, 500);
    }, duration * 1000);
  }
}

// ─── Subtitle / caption selection ────────────────────────────────────────────

/**
 * Waits for the YouTube player element to expose the setOption method.
 * Returns the player element or null if it times out.
 */
function waitForPlayer() {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const player = document.querySelector('#movie_player');
      if (player && typeof player.setOption === 'function') {
        resolve(player);
        return;
      }
      if (Date.now() - start > PLAYER_READY_TIMEOUT_MS) {
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
 *  2. Any track with translatable content (ASR) + auto-translate to target lang
 *  3. Give up silently (no captions available to auto-select)
 */
async function selectBestSubtitleTrack(player) {
  const tracks = getCaptionTracks();
  const target = settings.targetLanguage.toLowerCase();

  if (!tracks.length) return;

  // 1. Human subtitles in target language
  const humanTrack = tracks.find(
    (t) => t.languageCode?.toLowerCase() === target && t.kind !== 'asr'
  );
  if (humanTrack) {
    player.setOption('captions', 'track', {
      languageCode: humanTrack.languageCode,
      vssId: humanTrack.vssId,
    });
    return;
  }

  // 2. ASR auto-generated track (any language) + request auto-translate
  if (settings.enableAutoTranslateFallback) {
    const asrTrack = tracks.find((t) => t.kind === 'asr');
    if (asrTrack) {
      player.setOption('captions', 'track', {
        languageCode: asrTrack.languageCode,
        vssId: asrTrack.vssId,
        translationLanguage: {
          languageName: settings.targetLanguageName || 'English',
          languageCode: settings.targetLanguage,
        },
      });
      return;
    }

    // Last resort: any non-target-language track with auto-translate
    const anyTrack = tracks.find(
      (t) => t.languageCode?.toLowerCase() !== target
    );
    if (anyTrack) {
      player.setOption('captions', 'track', {
        languageCode: anyTrack.languageCode,
        vssId: anyTrack.vssId,
        translationLanguage: {
          languageName: settings.targetLanguageName || 'English',
          languageCode: settings.targetLanguage,
        },
      });
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

/**
 * Returns a human-readable language name for a BCP-47 language code.
 * Falls back to the raw code if Intl.DisplayNames is unavailable.
 */
function getLanguageName(code) {
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

async function handleNavigation() {
  // Only act on watch pages (not Shorts)
  if (!window.location.pathname.startsWith('/watch')) return;

  await loadSettings();

  const detectedCode = detectVideoLanguage();
  if (!detectedCode) return; // can't determine language — do nothing

  const target = settings.targetLanguage.toLowerCase();
  if (detectedCode === target) return; // video already in target language

  const detectedName = getLanguageName(detectedCode);
  const videoId = getVideoId();

  // Banner
  if (settings.showBanner && !isBannerDismissedForVideo(videoId)) {
    showBanner(detectedName);
  }

  // Subtitle selection
  if (settings.enableSubtitles) {
    const player = await waitForPlayer();
    if (player) {
      await selectBestSubtitleTrack(player);
    }
  }
}

// ─── Entry points ─────────────────────────────────────────────────────────────

// Initial page load
handleNavigation();

// YouTube SPA navigation — fires on every video change
document.addEventListener('yt-navigate-finish', () => {
  removeBanner(); // clear any leftover banner from the previous video
  handleNavigation();
});

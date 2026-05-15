# 🗼 BabelTube

**BabelTube** is a Chrome extension that automatically detects foreign-language YouTube videos and selects the best available subtitles in your target language — with no API keys, no cost, and no configuration required out of the box.

---

## Features

- **Language detection** — reads the video's audio language directly from YouTube's own page data (`ytInitialPlayerResponse`).
- **Smart subtitle selection** — automatically picks the best caption track:
  1. Human-made subtitles in your target language (highest quality)
  2. Auto-generated captions + YouTube's built-in auto-translate (fallback)
- **Translation banner** — when a foreign-language video is detected, shows a subtle bar at the top of the page guiding you to use Chrome's built-in right-click page translation.
- **Configurable** — set your target language, toggle features on/off, and control banner behaviour from the settings page.
- **SPA-aware** — handles YouTube's single-page navigation; re-runs automatically when you switch videos without a full page reload.
- **Debug mode** — a one-toggle developer tool that prints every internal decision to the DevTools console.

> **YouTube Shorts:** Not supported in v1. Support is planned for a future release.

---

## Installation (Development / Local Testing)

1. Clone or download this repo:
   ```
   git clone https://github.com/cluelessno1/babeltube.git
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `babeltube` folder.
5. The BabelTube icon (🗼) will appear in your Chrome toolbar.
6. Navigate to any YouTube video in a foreign language and BabelTube will activate automatically.

---

## Settings

Click the BabelTube toolbar icon → **"⚙ Full settings"**, or right-click the icon → **Options**.

| Setting | Default | Description |
|---|---|---|
| Target language | English | Language you want subtitles/translation in |
| Show translation banner | On | Displays a banner with right-click translate instructions |
| Banner auto-dismiss | 10 seconds | How long before the banner hides itself (5s / 10s / 30s / Never) |
| Auto-select subtitles | On | Automatically picks the best subtitle track |
| Auto-translate fallback | On | Uses YouTube auto-translate when no native subtitles exist |
| **Debug mode** | **Off** | Prints `[BabelTube]` logs to the DevTools console |

---

## Debugging

BabelTube has built-in structured logging for every decision it makes.

### Enable debug mode

Open **BabelTube Settings** → scroll to **Developer** → toggle **Debug mode** on.

Then open a YouTube watch page, press **F12** → **Console**, and filter by `BabelTube`.

### What you'll see

```
[BabelTube] Loaded. Enable "Debug mode" in BabelTube Settings (⚙) to see detailed logs.

--- after enabling debug mode and reloading ---

[BabelTube:reader] page-reader.js loaded (MAIN world). YouTube globals are accessible.
[BabelTube:reader] Initial load — video ID: "abc123"
[BabelTube:reader] Polling for ytInitialPlayerResponse (videoId="abc123")...
[BabelTube:reader] ytInitialPlayerResponse matched after 214ms. Extracting data...
[BabelTube:reader] Dispatching babeltube:page-data event...

[BabelTube] Debug mode: ON
[BabelTube] Settings: { targetLanguage: "en", ... }
[BabelTube] ▶ Page data received. videoId: "abc123"

  Language detection ▾
    Caption tracks received: 2
    ┌─ languageCode │ kind  │ name
    │ "ko"          │ "asr" │ "Korean (auto-generated)"
    │ "ko"          │ —     │ "Korean"
    Language via first human captionTrack: "ko"

[BabelTube] Detected: "ko" (Korean) | Target: "en" (English)
[BabelTube] Foreign language confirmed — activating BabelTube.
[BabelTube] Banner shown — video is "Korean", target is "English".
[BabelTube] Waiting for #movie_player.setOption...
[BabelTube] Player ready after 312ms.

  Subtitle selection ▾
    2 track(s) available, target: "en"
    ✓ ASR track found (lang="ko"). Enabling with auto-translate → "en".

[BabelTube] ▶ Done.
```

### Two-script architecture

BabelTube uses two content scripts to work around Chrome's extension isolation:

```
┌─────────────────────────────────────────────────────────────────┐
│  page-reader.js  (world: MAIN)                                  │
│  • Access: window.ytInitialPlayerResponse, window.ytcfg, etc.   │
│  • Cannot use: chrome.storage, chrome.runtime                   │
│  • Role: reads YouTube data, dispatches 'babeltube:page-data'   │
│                             ↓ CustomEvent via DOM               │
│  youtube.js  (world: ISOLATED)                                  │
│  • Access: chrome.storage, chrome.runtime                       │
│  • Cannot use: window.ytInitialPlayerResponse (page JS vars)    │
│  • Role: reads settings, shows banner, selects subtitle tracks  │
└─────────────────────────────────────────────────────────────────┘
```

### Common issues

| Log message | Likely cause | Fix |
|---|---|---|
| `No caption tracks at all` | Video has hardcoded/burned-in subtitles | Nothing to do — subtitles are part of the video image |
| `Timed out waiting for ytInitialPlayerResponse` | YouTube changed their page structure | Check if `window.ytInitialPlayerResponse` still exists in the console |
| `Player not ready after 15000ms` | YouTube changed `#movie_player` | Inspect the player DOM for a new selector |
| Banner shows but subtitles don't switch | `setOption` API changed | Log the track object and test manually: `document.querySelector('#movie_player').setOption('captions','track',{...})` |
| Debug logs not appearing | Debug mode is off | Enable in Settings → Developer → Debug mode |

---

## How It Works

```
YouTube watch page loads / navigates (SPA)
         │
         ▼
page-reader.js polls until ytInitialPlayerResponse.videoId matches URL
         │
         ▼  dispatches 'babeltube:page-data' CustomEvent
         │
         ▼
youtube.js receives event
         │
         ├─ Detect video language from caption/audio tracks
         │
         ├─ Same as target lang? → Do nothing
         │
         └─ Foreign language?
                │
                ├─ Show banner (if enabled): "Right-click → Translate to English"
                │
                └─ Wait for player, then select subtitles:
                       │
                       ├─ Human subtitles in target lang? → Select them
                       │
                       └─ No human subs? → Select ASR track + auto-translate
```

---

## Publishing to the Chrome Web Store

### Pre-publish checklist

- [ ] Replace `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` with properly-sized icons (not upscaled copies). The store requires: **16×16**, **48×48**, and **128×128** PNG files.
- [ ] Prepare a **1280×800** or **640×400** promotional screenshot for the store listing.
- [ ] Write a store description (see template below).
- [ ] Review [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/).
- [ ] Confirm **debug mode is OFF** before packaging (it's off by default).
- [ ] Bump the version in `manifest.json` before each submission.

### Store listing template

**Short description (132 chars max):**
> Auto-selects subtitles and guides page translation for foreign-language YouTube videos.

**Detailed description:**
> BabelTube detects when a YouTube video is in a language you don't understand and automatically selects the best subtitles — human-made if available, or auto-generated with translation as a fallback. It also shows a handy banner reminding you to use Chrome's built-in right-click page translation.
>
> No API keys. No subscriptions. Works entirely with YouTube's own data.
>
> Features:
> • Automatic subtitle/caption selection in your target language
> • Auto-translate fallback using YouTube's own engine
> • Translation reminder banner with configurable auto-dismiss
> • Supports 100+ target languages
> • Settings sync across all your Chrome devices

### Packaging

```powershell
Compress-Archive -Path C:\Repos\babeltube\* -DestinationPath babeltube.zip
```

Then upload `babeltube.zip` at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

---

## Project Structure

```
babeltube/
├── manifest.json                   # Extension manifest (MV3)
├── background.js                   # Service worker — seeds default settings on install
├── content_scripts/
│   ├── page-reader.js              # MAIN world — reads YouTube JS globals
│   └── youtube.js                  # ISOLATED world — chrome.storage, banner, subtitles
├── popup/
│   ├── popup.html                  # Toolbar popup UI
│   └── popup.js
├── options/
│   ├── options.html                # Full settings page (incl. debug toggle)
│   └── options.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## License

MIT

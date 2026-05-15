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
4. Click **Load unpacked** and select the `babeltube` folder (repo root).
5. The BabelTube icon (🗼) will appear in your Chrome toolbar.
6. Navigate to any **YouTube watch page** in a foreign language (not Shorts) and BabelTube will activate automatically.
7. After code changes, click **Reload** on the extension card at `chrome://extensions`.

### What to test

| Check | Expected |
|-------|----------|
| Foreign-language video + English target (in settings) | Subtitles switch to English (human or ASR + translate) |
| Translation banner (if enabled) | Banner appears and dismisses per settings |
| Toolbar popup on a watch page | Shows video/caption status |
| Popup on non-watch YouTube tab | Message that page is not supported |
| Switch video via in-page navigation (no full reload) | BabelTube runs on the new video |
| Options toggles | Save and persist after reload |
| Same language as target | No banner / no forced subtitle change |

Example test video: `https://www.youtube.com/watch?v=g6nXwkduldA` (Korean).

Full checklist (ads, staging folder, pre-upload): **[STORE_PUBLISH.md → Testing](STORE_PUBLISH.md#testing-before-you-package)**.

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

The toolbar **popup** reads `ytInitialPlayerResponse` via `chrome.scripting.executeScript` with `world: 'MAIN'` (same reason as `page-reader.js`).
```

### Common issues

| Log message | Likely cause | Fix |
|---|---|---|
| `No caption tracks at all` | Video has hardcoded/burned-in subtitles | Nothing to do — subtitles are part of the video image |
| `Timed out waiting for ytInitialPlayerResponse` | YouTube changed their page structure | Check if `window.ytInitialPlayerResponse` still exists in the console |
| `Player not ready after 15000ms` | YouTube changed `#movie_player` | Inspect the player DOM for a new selector |
| Banner shows but subtitles don't switch | `setOption` API changed | Log the track object and test manually: `document.querySelector('#movie_player').setOption('captions','track',{...})` |
| Debug logs not appearing | Debug mode is off | Enable in Settings → Developer → Debug mode |
| Popup shows Unknown / No captions on a working video | Popup script ran in isolated world (fixed in v1.0.1+) | Reload extension; popup must use MAIN-world inject |

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

**[STORE_PUBLISH.md](STORE_PUBLISH.md)** is the main guide: testing, building the ZIP, first-time listing/privacy copy, and **republishing updates**.

### Release workflow (summary)

1. **Test** — load unpacked from the repo; see [Testing](STORE_PUBLISH.md#testing-before-you-package).
2. **Bump version** in `manifest.json` (required for each store upload).
3. **Package:**
   ```powershell
   cd C:\Repos\babeltube
   .\scripts\package-store.ps1
   ```
4. **Test staging** — load unpacked from `%TEMP%\babeltube-store` (path printed by the script).
5. **Upload** `babeltube-store.zip` in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **Package** tab → **Submit for review**.

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/package-store.ps1` | Build `babeltube-store.zip` for upload |
| `scripts/resize-icons.py` | Regenerate 16 / 48 / 128 icons (`pip install pillow`) |
| `scripts/resize-store-screenshots.py` | Resize listing screenshots to 1280×800 |

### Store assets

- **Privacy policy:** [docs/privacy.html](docs/privacy.html) — host via [docs/README.md](docs/README.md)  
  Live URL: `https://cluelessno1.github.io/babeltube/privacy.html`
- **Screenshots:** [store/SCREENSHOTS.md](store/SCREENSHOTS.md)
- **Listing / privacy form text:** [STORE_PUBLISH.md](STORE_PUBLISH.md)

---

## Project Structure

```
babeltube/
├── manifest.json                   # Extension manifest (MV3)
├── STORE_PUBLISH.md                # Chrome Web Store submit checklist
├── docs/privacy.html               # Privacy policy (host at public HTTPS URL)
├── scripts/
│   ├── package-store.ps1           # Build babeltube-store.zip
│   ├── resize-icons.py             # Regenerate 16/48/128 icons from icon128
│   └── resize-store-screenshots.py # Resize store screenshots to 1280x800
├── store/                          # Listing screenshots (not in ZIP)
│   └── SCREENSHOTS.md
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

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

Click the BabelTube toolbar icon and then **"⚙ Full settings"**, or right-click the icon and choose **Options**.

| Setting | Default | Description |
|---|---|---|
| Target language | English | Language you want subtitles/translation in |
| Show translation banner | On | Displays a banner with right-click translate instructions |
| Banner auto-dismiss | 10 seconds | How long before the banner hides itself (5s / 10s / 30s / Never) |
| Auto-select subtitles | On | Automatically picks the best subtitle track |
| Auto-translate fallback | On | Uses YouTube auto-translate when no native subtitles exist |

---

## How It Works

```
YouTube watch page loads
        │
        ▼
Detect video language (ytInitialPlayerResponse)
        │
        ├─ Same as target lang? → Do nothing
        │
        └─ Foreign language detected
               │
               ├─ Show banner (if enabled): "Right-click → Translate to English"
               │
               └─ Wait for player, then select subtitles:
                      │
                      ├─ Human subtitles in target lang exist? → Select them
                      │
                      └─ No human subs → Select ASR track + auto-translate
```

---

## Publishing to the Chrome Web Store

### Pre-publish checklist

- [ ] Replace `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` with final, properly-sized icons (not upscaled copies of the same file). The store requires: **16×16**, **48×48**, and **128×128** PNG files.
- [ ] Prepare a **1280×800** or **640×400** promotional screenshot for the store listing.
- [ ] Write a store description (see below for a template).
- [ ] Review [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/).
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
> • Supports 100+ languages
> • Settings sync across all your Chrome devices

### Submitting

1. Zip the extension folder (everything inside `babeltube/`, not the folder itself):
   ```
   Compress-Archive -Path C:\Repos\babeltube\* -DestinationPath babeltube.zip
   ```
2. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
3. Click **New item** → upload `babeltube.zip`.
4. Fill in the store listing details, upload screenshots, and submit for review.

---

## Project Structure

```
babeltube/
├── manifest.json              # Extension manifest (MV3)
├── background.js              # Service worker — seeds default settings on install
├── content_scripts/
│   └── youtube.js             # Core logic: language detection, banner, subtitles
├── popup/
│   ├── popup.html             # Toolbar popup UI
│   └── popup.js
├── options/
│   ├── options.html           # Full settings page
│   └── options.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## License

MIT

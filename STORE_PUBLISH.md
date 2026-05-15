# Chrome Web Store — publish checklist

Use this after building `babeltube-store.zip` with `scripts/package-store.ps1`.

## 1. Developer account (you, one-time)

1. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with the Google account for the listing.
3. Pay the **one-time $5 USD** fee and accept the developer agreement.

## 2. Privacy policy URL

Host `docs/privacy.html` at a public HTTPS URL. Example with GitHub Pages:

```bash
# Option A: public repo with docs/ on default branch
# Settings → Pages → Deploy from branch → /docs → folder root or /docs
# URL: https://<user>.github.io/<repo>/privacy.html
```

If the main repo stays private, create a small public repo (e.g. `babeltube-privacy`) containing only `docs/privacy.html` and enable Pages.

**Listing field:** paste the full HTTPS URL to `privacy.html`.

## 3. Upload package

```powershell
cd C:\Repos\babeltube
.\scripts\package-store.ps1
```

Pre-flight: `chrome://extensions` → Load unpacked → select `%TEMP%\babeltube-store` (path printed by script). Test popup + subtitles on a watch page.

Upload **`babeltube-store.zip`** (not the repo folder).

## 4. Store listing (paste)

| Field | Value |
|-------|--------|
| **Name** | BabelTube |
| **Short description** | Auto-selects subtitles and guides page translation for foreign-language YouTube videos. |
| **Category** | Productivity or Accessibility |
| **Language** | English |

**Detailed description** (paste):

```
BabelTube detects when a YouTube video is in a language you don't understand and automatically selects the best subtitles — human-made if available, or auto-generated with translation as a fallback. It also shows a banner reminding you to use Chrome's built-in right-click page translation.

No API keys. No subscriptions. Works entirely with YouTube's own data.

Features:
• Automatic subtitle selection in your target language
• Auto-translate fallback using YouTube's built-in caption translation
• Optional translation reminder banner
• 100+ target languages
• Settings sync across your Chrome devices

Note: BabelTube works on YouTube watch pages. YouTube Shorts are not supported in v1.
```

**Icons** — use `icons/icon128.png` for the store; 16/48 are in the ZIP.

**Screenshots** — upload `store/screenshot-1.png`, `screenshot-2.png`, etc. (see `store/SCREENSHOTS.md` to resize captures).

**Optional URLs**

| Field | Value |
|-------|--------|
| Homepage URL | `https://github.com/cluelessno1/babeltube` |
| Support URL | `https://github.com/cluelessno1/babeltube/issues` |

**Publisher account (EEA):** Non-trader (personal / hobby, free extension).

## 5. Privacy tab (dashboard)

Open the **Privacy** section of your listing. Paste the fields below.

### Single purpose description

```
Help users watch foreign-language YouTube videos with automatic subtitles and translation guidance.
```

### Permission justification

**storage**

```
Stores the user's BabelTube preferences (target language, banner on/off, subtitle toggles, debug mode) using chrome.storage.sync so settings persist and can sync across the user's signed-in Chrome profile. No data is sent to the developer's servers.
```

**activeTab**

```
Allows the extension to read information from the tab the user is viewing only when the user opens the BabelTube toolbar popup, so the popup can show whether the current page is a YouTube watch page and display video/caption status. The extension does not access other tabs in the background.
```

**scripting**

```
Used only when the user opens the popup on a YouTube watch page to read caption track metadata already available in the page (via a one-time script injection). This powers the popup status display. No remote code is loaded; only bundled extension scripts run.
```

**Host permission** (`*://*.youtube.com/*`)

```
Required to run content scripts only on YouTube watch pages (youtube.com/watch*) so BabelTube can read the video's language and available caption tracks from the page, select the appropriate subtitle track, and optionally show a translation reminder banner. The extension does not run on other sites and does not send page data to the developer's servers.
```

### Remote code

Select: **No, I am not using Remote code** (leave justification empty).

### Data usage (checkboxes)

| Data type | Check? |
|-----------|--------|
| Website content | **Yes** — reads caption/language metadata on YouTube watch pages; processed locally only |
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |

Certify **all three** statements at the bottom (no selling data, no unrelated use, no credit/lending use).

### Privacy policy URL

```
https://cluelessno1.github.io/babeltube/privacy.html
```

(Source file in repo: `docs/privacy.html`. Must match what you disclose above.)

## 6. Distribution

- **Visibility:** Public  
- **Regions:** Worldwide (or your choice)

## 7. Submit

Dashboard → **Submit for review**. Typical review: 1–3 business days.

After approval, bump `version` in `manifest.json` for each update and upload a new ZIP to the same item.

# Chrome Web Store — publish checklist

Dashboard: [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)  
Listing ID: `acmokckfempipaglglgokhkapijacmop`

---

## Quick reference (every release)

| Step | Action |
|------|--------|
| 1 | Test locally (see [Testing](#testing-before-you-package) below) |
| 2 | Bump `version` in `manifest.json` |
| 3 | Run `.\scripts\package-store.ps1` |
| 4 | Test the **staging** folder (path printed by the script) |
| 5 | Upload `babeltube-store.zip` in the dashboard → **Package** tab |
| 6 | **Submit for review** (updates are reviewed too) |

---

## Testing (before you package)

Test after **every code change** and again from the **staging folder** right before upload.

### Load the extension

**Option A — repo folder (day-to-day dev)**

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `C:\Repos\babeltube` (repo root)
3. After edits, click **Reload** on the BabelTube card

**Option B — staging folder (pre-upload sanity check)**

1. Run `.\scripts\package-store.ps1`
2. **Load unpacked** → select the folder printed (usually `%TEMP%\babeltube-store`)
3. This matches what is inside the ZIP (no `.git`, same layout as the store package)

### Test checklist

Use a **foreign-language watch page** (not Shorts). Example: Korean video with English target language in settings.

| # | Test | Expected |
|---|------|----------|
| 1 | Open `https://www.youtube.com/watch?v=g6nXwkduldA` (or any non-English video) | Extension runs on `/watch` only |
| 2 | Target language = **English** in BabelTube settings | Saved in `chrome.storage.sync` |
| 3 | Subtitles | English subs selected (human or ASR + auto-translate) |
| 4 | Translation banner | Shows if enabled; dismisses per settings |
| 5 | Toolbar **popup** on that watch page | Shows video/caption status |
| 6 | Popup on a non-watch tab (e.g. `youtube.com` home) | Indicates not a watch page |
| 7 | **SPA navigation** — click another video without full reload | BabelTube runs again on the new video |
| 8 | **Options** page | Toggles save and persist after reload |
| 9 | Same-language video (e.g. English video, English target) | No banner / no forced subtitle change |
| 10 | **Debug mode** | Off for store builds (default) |

**Optional (ads / incognito):** If you changed `page-reader.js` ad logic, test in **Incognito** with a non-Premium account or a video that shows ads. Confirm subtitles apply after pre-roll ends.

**Optional (debug):** Settings → Developer → **Debug mode** on → F12 → Console → filter `BabelTube`. See README *Debugging* section.

### Manifest limits before packaging

- `description` in `manifest.json` must be **≤ 132 characters** (Chrome rejects longer ZIPs)
- `version` must be **higher** than the version already published for each new upload

---

## Build the store ZIP

From the repo root in PowerShell:

```powershell
cd C:\Repos\babeltube

# Optional: only if you changed icon artwork
python scripts\resize-icons.py

# Build ZIP (excludes .git; files at archive root)
.\scripts\package-store.ps1
```

**Output:** `C:\Repos\babeltube\babeltube-store.zip` (gitignored — do not commit)

**Included in ZIP:** `manifest.json`, `background.js`, `content_scripts/`, `popup/`, `options/`, `icons/`

**Not included:** `store/`, `docs/`, `scripts/`, `.git`, `README.md`

Re-run the script after any change you intend to ship.

---

## Republish an update (after first approval)

1. Make and test code changes locally (see [Testing](#testing-before-you-package)).
2. **Bump version** in `manifest.json` (e.g. `1.0.0` → `1.0.1` or `1.1.0`).
3. Run `.\scripts\package-store.ps1` and test the staging folder again.
4. Open [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **BabelTube**.
5. **Package** tab → upload the new `babeltube-store.zip`.
6. If the UI changed, update **Store listing** screenshots (`store/SCREENSHOTS.md`).
7. If data practices changed, update `docs/privacy.html`, push to GitHub Pages, and edit the **Privacy** tab.
8. **Submit for review** — updates are reviewed (often faster than the first submission).
9. After approval, the new version rolls out to users automatically.

**Rejected?** Read the email/dashboard note, fix the cited issue, bump version if you already uploaded that build, and resubmit.

---

## First-time publish

### 1. Developer account (one-time)

1. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with the Google account for the listing.
3. Pay the **one-time $5 USD** fee and accept the developer agreement.
4. **EEA trader/non-trader:** Non-trader (personal / hobby, free extension).

### 2. Privacy policy URL

Host `docs/privacy.html` at a public HTTPS URL. Example with GitHub Pages:

```bash
# Option A: public repo with docs/ on default branch
# Settings → Pages → Deploy from branch → /docs → folder root or /docs
# URL: https://<user>.github.io/<repo>/privacy.html
```

If the main repo stays private, create a small public repo (e.g. `babeltube-privacy`) containing only `docs/privacy.html` and enable Pages.

**Listing field:** paste the full HTTPS URL to `privacy.html`.

### 3. Upload package

Build and test using [Build the store ZIP](#build-the-store-zip) and [Testing](#testing-before-you-package), then upload **`babeltube-store.zip`** (not the repo folder) on the **Package** tab.

### 4. Store listing (paste)

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

### 5. Privacy tab (dashboard)

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

### 6. Distribution

- **Visibility:** Public  
- **Regions:** Worldwide (or your choice)

### 7. Submit

Dashboard → **Submit for review**. Typical review: 1–3 business days.

For later releases, follow [Republish an update](#republish-an-update-after-first-approval).

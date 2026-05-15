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

**Detailed description** — see README “Store listing template” or plan.

**Icons** — use `icons/icon128.png` for the store; 16/48 are in the ZIP.

**Screenshots** — see `store/SCREENSHOTS.md`.

## 5. Privacy practices (dashboard)

- **Single purpose:** Help users watch foreign-language YouTube videos with automatic subtitles and translation guidance.
- **Remote collection:** No.
- **storage:** User preferences stored locally / Chrome sync.
- **Host (youtube.com):** Required only on watch pages to detect language and set caption tracks.
- **scripting:** Used only when the user opens the popup on a watch page to read caption metadata.

## 6. Distribution

- **Visibility:** Public  
- **Regions:** Worldwide (or your choice)

## 7. Submit

Dashboard → **Submit for review**. Typical review: 1–3 business days.

After approval, bump `version` in `manifest.json` for each update and upload a new ZIP to the same item.

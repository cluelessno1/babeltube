# Store screenshots

Chrome Web Store requires **at least one** screenshot. Recommended: **1280×800** PNG or JPEG (also accepts 640×400).

## Suggested captures

1. **Watch page** — foreign-language video with subtitles visible (optional: translation banner).
2. **Popup** — toolbar icon open on a watch page showing detected language / status.
3. **Settings** — options page with target language and toggles.

## How to capture on Windows

1. Open a foreign-language YouTube watch page (e.g. Korean with English target in settings).
2. Press **Win + Shift + S** → rectangular snip, or use Chrome full-page if needed.
3. Resize/crop to **1280×800** in Paint, Photos, or an editor.
4. Save as `store/screenshot-1.png` (etc.) for your records; upload files in the developer dashboard.

Draft **1280×800** placeholders (replace before submit):

```powershell
python scripts/generate-store-screenshots.py
```

Outputs: `store/screenshot-1-watch.png`, `screenshot-2-popup.png`, `screenshot-3-settings.png`. Replace with real UI captures when possible — misleading screenshots can cause review rejection.

These files are **not** bundled in the extension ZIP.

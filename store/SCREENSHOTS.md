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

### Resize your captures for the store

Drop PNG/JPEG captures in this folder (any size), then run:

```powershell
python scripts/resize-store-screenshots.py
```

Outputs **`screenshot-1.png`**, **`screenshot-2.png`**, … at **1280×800** (letterboxed on a dark background so nothing is cropped). Upload those to the Chrome Web Store.

Original files are left unchanged. Re-run after adding more captures.

These files are **not** bundled in the extension ZIP.

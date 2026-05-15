# Store screenshots

Chrome Web Store requires **at least one** screenshot. Recommended: **1280×800** PNG or JPEG (also accepts 640×400).

**Not bundled** in the extension ZIP — for the dashboard listing only.

---

## Capture

1. Open a foreign-language YouTube **watch page** (e.g. Korean with English target in BabelTube settings).
2. Take shots that match what users will see:
   - Watch page with subtitles (and optional banner)
   - Toolbar popup on a watch page
   - BabelTube settings page
3. On Windows: **Win + Shift + S** → save PNG into this `store/` folder.

Suggested test video: `https://www.youtube.com/watch?v=g6nXwkduldA`

---

## Resize for upload

Drop PNG/JPEG files here (any size; any filename except existing `screenshot-N.png` outputs), then:

```powershell
cd C:\Repos\babeltube
python scripts/resize-store-screenshots.py
```

**Outputs:** `screenshot-1.png`, `screenshot-2.png`, … at **1280×800** (letterboxed on a dark background so UI is not cropped).

Upload those files in the dashboard **Store listing** tab. Re-run after adding new captures.

**Tip:** Use real UI screenshots for review. Replace draft/placeholder images before submit if you used any.

---

## When to update screenshots

Update listing images when you **republish** and the UI changed materially. See [STORE_PUBLISH.md → Republish](../STORE_PUBLISH.md#republish-an-update-after-first-approval).

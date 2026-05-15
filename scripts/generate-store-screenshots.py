#!/usr/bin/env python3
"""
Optional draft store images (1280x800) until you replace them with real UI captures.
Run: pip install pillow && python scripts/generate-store-screenshots.py
"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    raise SystemExit('Install Pillow: pip install pillow')

STORE = Path(__file__).resolve().parent.parent / 'store'
STORE.mkdir(exist_ok=True)

W, H = 1280, 800
BG = (15, 23, 42)
ACCENT = (56, 189, 248)
TEXT = (241, 245, 249)
MUTED = (148, 163, 184)

slides = [
    ('screenshot-1-watch.png', 'YouTube watch page', 'Foreign-language video with subtitles + optional banner'),
    ('screenshot-2-popup.png', 'Extension popup', 'Detected language and status on a watch page'),
    ('screenshot-3-settings.png', 'Settings', 'Target language, banner, and subtitle toggles'),
]

for filename, title, subtitle in slides:
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((80, 120, W - 80, H - 120), radius=24, outline=ACCENT, width=3)
    try:
        font_lg = ImageFont.truetype('arial.ttf', 48)
        font_sm = ImageFont.truetype('arial.ttf', 28)
    except OSError:
        font_lg = ImageFont.load_default()
        font_sm = ImageFont.load_default()
    draw.text((120, 180), 'BabelTube', fill=ACCENT, font=font_lg)
    draw.text((120, 260), title, fill=TEXT, font=font_lg)
    draw.text((120, 340), subtitle, fill=MUTED, font=font_sm)
    draw.text(
        (120, H - 200),
        'Replace with a real 1280x800 capture before store submit',
        fill=MUTED,
        font=font_sm,
    )
    out = STORE / filename
    img.save(out)
    print(f'Wrote {out}')

print('See store/SCREENSHOTS.md for real UI capture steps.')

#!/usr/bin/env python3
"""Regenerate icon16.png and icon48.png from icon128.png (LANCZOS)."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Install Pillow: pip install pillow')

icons_dir = Path(__file__).resolve().parent.parent / 'icons'
src = icons_dir / 'icon128.png'
if not src.exists():
    raise SystemExit(f'Missing {src}')

img = Image.open(src)
for size in (16, 48, 128):
    out = icons_dir / f'icon{size}.png'
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(out)
    print(f'Wrote {out} ({size}x{size})')

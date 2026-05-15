#!/usr/bin/env python3
"""Resize store screenshots to Chrome Web Store size (1280x800, RGB PNG)."""
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit('Install Pillow: pip install pillow')

STORE = Path(__file__).resolve().parent.parent / 'store'
TARGET_W, TARGET_H = 1280, 800
BG = (15, 15, 15)  # near YouTube dark; letterbox bars
SKIP_PREFIXES = ('screenshot-',)
SKIP_NAMES = {'screenshot-1-watch.png', 'screenshot-2-popup.png', 'screenshot-3-settings.png'}


def is_source_image(path: Path) -> bool:
    if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
        return False
    if path.name in SKIP_NAMES:
        return False
    if any(path.name.startswith(p) for p in SKIP_PREFIXES):
        return False
    try:
        with Image.open(path) as im:
            return im.size != (TARGET_W, TARGET_H)
    except OSError:
        return False


def resize_contain(src: Image.Image) -> Image.Image:
    src = src.convert('RGBA')
    canvas = Image.new('RGB', (TARGET_W, TARGET_H), BG)
    scale = min(TARGET_W / src.width, TARGET_H / src.height)
    w = max(1, int(src.width * scale))
    h = max(1, int(src.height * scale))
    resized = src.resize((w, h), Image.Resampling.LANCZOS)
    rgb = Image.new('RGB', (w, h), BG)
    rgb.paste(resized, mask=resized.split()[3])
    x = (TARGET_W - w) // 2
    y = (TARGET_H - h) // 2
    canvas.paste(rgb, (x, y))
    return canvas


def main() -> None:
    sources = sorted(p for p in STORE.iterdir() if p.is_file() and is_source_image(p))
    if not sources:
        raise SystemExit(f'No source images found in {STORE}')

    for i, src in enumerate(sources, start=1):
        out = STORE / f'screenshot-{i}.png'
        with Image.open(src) as im:
            result = resize_contain(im)
            result.save(out, 'PNG', optimize=True)
        print(f'{src.name} ({im.size}) -> {out.name} ({TARGET_W}x{TARGET_H})')

    print(f'Done. Upload screenshot-1.png … screenshot-{len(sources)}.png to the Chrome Web Store.')


if __name__ == '__main__':
    main()

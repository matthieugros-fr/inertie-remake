"""Planche des tuiles d'une caverne (code hex au-dessus de chaque tuile)."""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from caves import load, tile_pixels, PALETTE
from scr import firmware_rgb
from PIL import Image, ImageDraw
fn, out = sys.argv[1], sys.argv[2]
n = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0x5C
data, raw, mp = load(fn)
cols = 16
S = 3
img = Image.new('RGB', (cols * 24 * S, ((n + cols - 1) // cols) * 32 * S), (50, 50, 60))
dr = ImageDraw.Draw(img)
for code in range(n):
    t = tile_pixels(data, code)
    cx, cy = code % cols, code // cols
    ox, oy = cx * 24 * S, cy * 32 * S + 10 * S
    dr.text((ox + 2, oy - 10 * S + 2), '%02X' % code, fill=(255, 255, 255))
    for y in range(20):
        for x in range(10):
            c = firmware_rgb(PALETTE[t[y][x]])
            dr.rectangle([ox + x * 2 * S, oy + y * S, ox + x * 2 * S + 2 * S - 1, oy + y * S + S - 1], fill=c)
img.save(out)

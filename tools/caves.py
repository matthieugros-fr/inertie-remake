"""Extraction des cavernes d'Inertie (fichiers 3 lettres chargés en &5038).

Structure établie d'après le code du jeu (GAME.BIN déchiffré) :
  &5038 + 0      carte : 108 écrans de 10x10 tuiles (1 octet/tuile), grille 12 x 9 écrans
                 (au chargement : 0x40 -> 0x27, bit 7 effacé ; un code >= 0x80 s'affiche comme 0x08)
  &7ACC          graphismes des tuiles : code * 100 octets, 5 octets (10 px mode 0) x 20 lignes

Usage :
  python3 -I tools/caves.py png  CAVE.BIN sortie.png
  python3 -I tools/caves.py json CAVE.BIN sortie.json
"""
import json
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from scr import decode_byte, firmware_rgb  # noqa: E402

BASE = 0x5038
MAP_LEN = 0x2A30
TILES = 0x7ACC
GRID_W, GRID_H = 12, 9
PALETTE = [0, 1, 2, 4, 0, 11, 6, 15, 3, 24, 26, 9, 18, 20, 17, 13]  # table &05AF de GAME.BIN


def load(fn):
    data = open(fn, 'rb').read()
    raw = data[:MAP_LEN]
    mp = bytes(((0x27 if b == 0x40 else b) & 0x7F) for b in raw)
    return data, raw, mp


def tile_pixels(data, code):
    off = TILES - BASE + code * 100
    blk = data[off:off + 100]
    rows = []
    for y in range(20):
        row = []
        for xb in range(5):
            row.extend(decode_byte(blk[y * 5 + xb] if y * 5 + xb < len(blk) else 0))
        rows.append(row)
    return rows


def render_png(fn, out):
    from PIL import Image
    data, raw, mp = load(fn)
    cache = {}
    W, H = GRID_W * 100, GRID_H * 200
    img = Image.new('RGB', (W * 2, H))
    px = img.load()
    for s in range(GRID_W * GRID_H):
        sx, sy = s % GRID_W, s // GRID_W
        for ty in range(10):
            for tx in range(10):
                code = mp[s * 100 + ty * 10 + tx]
                if raw[s * 100 + ty * 10 + tx] >= 0x80:
                    code = 0x08
                if code not in cache:
                    cache[code] = tile_pixels(data, code)
                t = cache[code]
                for y in range(20):
                    for x in range(10):
                        c = firmware_rgb(PALETTE[t[y][x]])
                        X = (sx * 100 + tx * 10 + x) * 2
                        Y = sy * 200 + ty * 20 + y
                        px[X, Y] = c
                        px[X + 1, Y] = c
    img.save(out)


def main():
    cmd, fn, out = sys.argv[1:4]
    if cmd == 'png':
        render_png(fn, out)
    elif cmd == 'json':
        data, raw, mp = load(fn)
        json.dump({'map': list(raw)}, open(out, 'w'))


if __name__ == '__main__':
    main()

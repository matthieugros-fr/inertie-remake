"""Décodage d'un écran CPC mode 0 (16 Ko à &C000) : indices d'encre et PNG.

Usage :
  python3 -I tools/scr.py ascii fichier.scn x0 x1 y0 y1
  python3 -I tools/scr.py png fichier.scn sortie.png [palette firmware séparée par des virgules]
"""
import sys

HEX = '0123456789ABCDEF'


def decode_byte(b):
    p0 = ((b >> 7) & 1) | (((b >> 3) & 1) << 1) | (((b >> 5) & 1) << 2) | (((b >> 1) & 1) << 3)
    p1 = ((b >> 6) & 1) | (((b >> 2) & 1) << 1) | (((b >> 4) & 1) << 2) | ((b & 1) << 3)
    return p0, p1


def decode_screen(data, width_bytes=80, lines=200):
    pix = []
    for y in range(lines):
        row = []
        base = (y % 8) * 0x800 + (y // 8) * width_bytes
        for xb in range(width_bytes):
            row.extend(decode_byte(data[base + xb]))
        pix.append(row)
    return pix


def firmware_rgb(n):
    lv_rb = [0x00, 0x63, 0xFF]
    lv_g = [0x00, 0x65, 0xFF]
    g, r, b = n // 9, (n // 3) % 3, n % 3
    return (lv_rb[r], lv_g[g], lv_rb[b])


def main():
    cmd, fn = sys.argv[1], sys.argv[2]
    data = open(fn, 'rb').read()
    pix = decode_screen(data)
    if cmd == 'ascii':
        x0, x1, y0, y1 = map(int, sys.argv[3:7])
        for y in range(y0, y1):
            print('%3d ' % y + ''.join(HEX[p] for p in pix[y][x0:x1]))
    elif cmd == 'png':
        from PIL import Image
        out = sys.argv[3]
        pal = list(map(int, sys.argv[4].split(','))) if len(sys.argv) > 4 else list(range(16))
        img = Image.new('RGB', (320, 200))
        for y in range(200):
            for x in range(160):
                c = firmware_rgb(pal[pix[y][x]])
                img.putpixel((2 * x, y), c)
                img.putpixel((2 * x + 1, y), c)
        img = img.resize((640, 400), Image.NEAREST)
        img.save(out)


if __name__ == '__main__':
    main()

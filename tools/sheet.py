"""Affiche un binaire comme une planche mode 0 (pour repérer les graphismes à l'oeil).
Usage : python3 -I tools/sheet.py fichier.bin largeur_octets sortie.png [debut fin]"""
import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from scr import decode_byte, firmware_rgb
from PIL import Image
PAL = [0, 1, 2, 4, 0, 11, 6, 15, 3, 24, 26, 9, 18, 20, 17, 13]
fn, wb, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
d = open(fn, 'rb').read()
a = int(sys.argv[4], 16) if len(sys.argv) > 4 else 0
b = int(sys.argv[5], 16) if len(sys.argv) > 5 else len(d)
d = d[a:b]
rows = (len(d) + wb - 1) // wb
colh = 400
ncol = (rows + colh - 1) // colh
img = Image.new('RGB', (ncol * (wb * 2 + 4) * 2, colh), (40, 40, 40))
px = img.load()
for r in range(rows):
    c, y = divmod(r, colh)
    for xb in range(wb):
        i = r * wb + xb
        if i >= len(d):
            break
        for k, p in enumerate(decode_byte(d[i])):
            X = (c * (wb * 2 + 4) + xb * 2 + k) * 2
            col = firmware_rgb(PAL[p])
            px[X, y] = col
            px[X + 1, y] = col
img = img.resize((img.width * 2, img.height * 2), Image.NEAREST)
img.save(out)
print(img.size, 'colonnes', ncol)

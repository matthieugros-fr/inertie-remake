"""Assemble des captures 640x200 en une planche (lignes doublées)."""
import sys
from PIL import Image
files, out = sys.argv[1:-1], sys.argv[-1]
ims = [Image.open(f).resize((640, 400), Image.NEAREST) for f in files]
cols = 2
rows = (len(ims) + 1) // 2
c = Image.new('RGB', (cols * 650, rows * 410), (30, 30, 30))
for i, im in enumerate(ims):
    c.paste(im, ((i % cols) * 650, (i // cols) * 410))
c.save(out)

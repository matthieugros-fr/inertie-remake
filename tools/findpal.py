import sys, glob
FW2HW=[0x54,0x44,0x55,0x5C,0x58,0x5D,0x4C,0x45,0x4D,0x56,0x46,0x57,0x5E,0x40,0x5F,0x4E,0x47,0x4F,0x52,0x42,0x53,0x5A,0x59,0x5B,0x4A,0x43,0x4B]
# palette partielle déduite de la capture : None = inconnu
fw=[0,1,None,4,None,11,6,15,3,24,26,9,18,20,17,13]
for fn in sorted(glob.glob('ref/files*/*.bin')):
    d=open(fn,'rb').read()
    for name,pat in (('fw',fw),('hw',[FW2HW[c] if c is not None else None for c in fw])):
        for i in range(len(d)-16):
            ok=all(p is None or d[i+k]==p for k,p in enumerate(pat))
            if ok: print(fn,name,hex(i),d[i:i+17].hex())

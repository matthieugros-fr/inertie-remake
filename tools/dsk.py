"""Lecture d'images disque Amstrad CPC (.dsk standard et étendu) et extraction AMSDOS.

Usage :
  python3 -I tools/dsk.py info  image.dsk
  python3 -I tools/dsk.py files image.dsk dossier_sortie
"""
import os
import struct
import sys


class Dsk:
    def __init__(self, path):
        data = open(path, 'rb').read()
        self.data = data
        sig = data[:34]
        self.extended = sig.startswith(b'EXTENDED')
        if not (self.extended or sig.startswith(b'MV - CPC')):
            raise ValueError('signature DSK inconnue : %r' % sig)
        self.ntracks = data[0x30]
        self.nsides = data[0x31]
        self.tracks = {}  # (piste, face) -> liste de secteurs
        off = 0x100
        for t in range(self.ntracks * self.nsides):
            if self.extended:
                size = data[0x34 + t] * 256
            else:
                size = struct.unpack_from('<H', data, 0x32)[0]
            if size == 0:
                continue
            blk = data[off:off + size]
            if not blk.startswith(b'Track-Info'):
                off += size
                continue
            track, side = blk[0x10], blk[0x11]
            ssize_code = blk[0x14]
            nsec = blk[0x15]
            secs = []
            p = 0x100
            for s in range(nsec):
                c, h, r, n, st1, st2, alen = struct.unpack_from('<BBBBBBH', blk, 0x18 + s * 8)
                if not self.extended:
                    alen = 128 << ssize_code
                secs.append({'C': c, 'H': h, 'R': r, 'N': n, 'st1': st1, 'st2': st2,
                             'data': blk[p:p + alen]})
                p += alen
            self.tracks[(track, side)] = secs
            off += size

    def sector(self, track, rid, side=0):
        for s in self.tracks.get((track, side), []):
            if s['R'] == rid:
                return s['data']
        return None

    def info(self):
        print('format', 'étendu' if self.extended else 'standard', 'pistes', self.ntracks, 'faces', self.nsides)
        for (t, h), secs in sorted(self.tracks.items()):
            ids = ' '.join('%02X/N%d/%d' % (s['R'], s['N'], len(s['data'])) for s in secs)
            print('piste %2d face %d : %s' % (t, h, ids))


def amsdos_files(dsk):
    """Catalogue AMSDOS (format DATA C1..C9 ou SYSTEM 41..49)."""
    first = dsk.tracks.get((0, 0), [])
    ids = sorted(s['R'] for s in first)
    if ids and ids[0] >= 0xC1:
        base, off_track = 0xC1, 0
    else:
        base, off_track = 0x41, 2
    spt = 9

    def block(b):
        out = b''
        for k in range(2):
            ls = b * 2 + k
            tr = off_track + ls // spt
            r = base + ls % spt
            d = dsk.sector(tr, r)
            out += d if d else b'\0' * 512
        return out

    dirdata = block(0) + block(1)
    entries = {}
    for i in range(64):
        e = dirdata[i * 32:(i + 1) * 32]
        user = e[0]
        if user == 0xE5:
            continue
        name = bytes(c & 0x7F for c in e[1:9]).decode('ascii', 'replace').strip()
        ext = bytes(c & 0x7F for c in e[9:12]).decode('ascii', 'replace').strip()
        extent = e[12]
        rc = e[15]
        blocks = [b for b in e[16:32] if b]
        key = (user, name, ext)
        entries.setdefault(key, []).append((extent, rc, blocks))
    files = {}
    for key, exts in entries.items():
        data = b''
        last_rc = 0
        for extent, rc, blocks in sorted(exts):
            for b in blocks:
                data += block(b)
            last_rc = rc
        nrec = (len(exts) - 1) * 128 + last_rc
        files[key] = data[:nrec * 128]
    return files


def amsdos_header(data):
    if len(data) < 128:
        return None
    h = data[:128]
    chk = sum(h[:67]) & 0xFFFF
    if chk != struct.unpack_from('<H', h, 67)[0]:
        return None
    return {'type': h[18], 'load': struct.unpack_from('<H', h, 21)[0],
            'length': struct.unpack_from('<H', h, 24)[0],
            'exec': struct.unpack_from('<H', h, 26)[0],
            'reallen': h[64] | (h[65] << 8) | (h[66] << 16)}


def main():
    cmd, path = sys.argv[1], sys.argv[2]
    d = Dsk(path)
    if cmd == 'info':
        d.info()
        for (user, name, ext), data in sorted(amsdos_files(d).items()):
            h = amsdos_header(data)
            hs = ('type %d charge &%04X long &%04X exec &%04X' % (h['type'], h['load'], h['length'], h['exec'])) if h else 'sans en-tête'
            print('u%d %-8s.%-3s %6d octets  %s' % (user, name, ext, len(data), hs))
    elif cmd == 'files':
        out = sys.argv[3]
        os.makedirs(out, exist_ok=True)
        for (user, name, ext), data in amsdos_files(d).items():
            h = amsdos_header(data)
            fn = '%s.%s' % (name, ext) if ext else name
            fn = fn.replace('/', '_')
            if h:
                body = data[128:128 + h['length']]
                open(os.path.join(out, fn + '.bin'), 'wb').write(body)
                open(os.path.join(out, fn + '.hdr'), 'w').write(
                    'load=%04X length=%04X exec=%04X type=%d\n' % (h['load'], h['length'], h['exec'], h['type']))
            else:
                open(os.path.join(out, fn), 'wb').write(data)
            print('extrait', fn, len(data))


if __name__ == '__main__':
    main()

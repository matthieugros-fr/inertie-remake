"""Fabrique dist/Inertie.html : le jeu complet en un seul fichier, à ouvrir d'un double-clic (usage personnel).

Tout est intégré : scripts, sons, musiques ET les fichiers extraits des disquettes de l'utilisateur (ref/).
Ce fichier contient donc le jeu d'Ubi Soft : il ne doit jamais être publié (dist/ est exclu du dépôt).

Usage : python3 -I tools/build_single.py
"""
import base64
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def rel(*p):
    return os.path.join(ROOT, *p)


def main():
    html = open(rel('index.html'), encoding='utf-8').read()

    # 1. fichiers servis à fetch() : fichiers du jeu, sons, musiques, voix
    embed = {}
    for d in ('ref/files1', 'ref/files2'):
        for n in sorted(os.listdir(rel(d))):
            if n.endswith('.bin') or n.endswith('.hdr'):
                embed[d + '/' + n] = open(rel(d, n), 'rb').read()
    for d in ('assets/sfx', 'assets/sfx_dog', 'assets/voix', 'assets/music', 'assets/music_amstrad', 'assets/music_dog'):
        if os.path.isdir(rel(d)):
            for n in sorted(os.listdir(rel(d))):
                if n.endswith('.mp3'):
                    embed[d + '/' + n] = open(rel(d, n), 'rb').read()
    table = {k: base64.b64encode(v).decode('ascii') for k, v in embed.items()}

    # fetch() lit d'abord dans les fichiers intégrés (le chemin demandé, relatif)
    shim = """<script>
(function () {
  const EMBED = %s;
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  const bytes = (b64) => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  window.fetch = function (url, opts) {
    const key = String(url).replace(/^\\.\\//, '').split('?')[0];
    if (EMBED[key] !== undefined) {
      const body = bytes(EMBED[key]);
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': key.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream' } }));
    }
    if (/^(ref|assets)\\//.test(key)) return Promise.resolve(new Response('', { status: 404 }));
    return realFetch ? realFetch(url, opts) : Promise.reject(new Error(key));
  };
})();
</script>""" % json.dumps(table)

    # 2. scripts intégrés à la place des <script src>
    def inline(m):
        src = m.group(1)
        code = open(rel(src), encoding='utf-8').read().replace('</script', '<\\/script')
        return '<script>/* %s */\n%s\n</script>' % (src, code)

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    html = html.replace('<head>', '<head>\n' + shim, 1) if '<head>' in html else shim + html

    os.makedirs(rel('dist'), exist_ok=True)
    out = rel('dist', 'Inertie.html')
    open(out, 'w', encoding='utf-8').write(html)
    print('écrit', out, '%.1f Mo' % (os.path.getsize(out) / 1e6), len(embed), 'fichiers intégrés')


if __name__ == '__main__':
    main()

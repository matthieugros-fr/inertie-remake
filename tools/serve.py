"""Petit serveur local sans cache : python3 tools/serve.py [port]  puis ouvrir http://localhost:8642/"""
import functools
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = functools.partial(NoCache, directory=root)
    try:
        class Server(http.server.ThreadingHTTPServer):
            request_queue_size = 128  # la page demande une quarantaine de fichiers à la fois
            daemon_threads = True
        server = Server(('127.0.0.1', port), handler)
    except OSError:
        # un serveur tourne déjà sur ce port (lancé plus tôt) : il suffit d'ouvrir la page
        print('Inertie tourne déjà : http://localhost:%d/' % port)
        sys.exit(0)
    print('Inertie : http://localhost:%d/' % port)
    server.serve_forever()

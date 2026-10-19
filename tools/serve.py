"""Local test server for the map: like `python -m http.server`, but never cached,
so every reload shows the latest version of the files.

Usage (from the project folder):  python tools/serve.py   then open http://localhost:8000
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    except OSError:
        print(f"El puerto {PORT} ya esta en uso: probablemente el mapa ya esta abierto en otra ventana.")
        print(f"Abre http://localhost:{PORT} en el navegador, o cierra la otra ventana y vuelve a intentar.")
        sys.exit(1)
    with httpd:
        print(f"Mapa de Proyectos: http://localhost:{PORT}  (cierra esta ventana para detenerlo)", flush=True)
        httpd.serve_forever()

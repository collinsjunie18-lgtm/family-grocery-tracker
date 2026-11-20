"""Local preview server for Family Groceries. NOT part of the deployed app.

Serves the app folder as-is, except config.js is swapped for _preview/config.js,
which points the app at a stand-in database (sample data, in memory) so testing
never reads or writes the family's real list and never sends a real push.

    python _preview/serve.py [port]
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        if path.split("?", 1)[0] == "/config.js":
            return os.path.join(ROOT, "_preview", "config.js")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):  # /api/notify — swallow it; no pushes from preview
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Family Groceries preview on http://localhost:{PORT}")
        httpd.serve_forever()

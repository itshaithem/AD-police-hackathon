"""Local (non-docker) server for the fictional demo sites, routing by Host header.

Run: python demo-sites/dev_server.py   (listens on 127.0.0.1:8090)
Point the sandbox at it with SANDBOX_HOST_RULES="MAP *.test 127.0.0.1:8090".
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
SITES = {"saqrbank.test", "saqrbank-secure-login.test"}


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        host = (self.headers.get("Host") or "").split(":")[0]
        site = host if host in SITES else "saqrbank.test"
        rel = path.split("?")[0].lstrip("/") or "index.html"
        return str(ROOT / site / rel)

    def do_GET(self):
        if self.path == "/r/abc":
            self.send_response(302)
            self.send_header("Location", "http://saqrbank-secure-login.test/")
            self.end_headers()
            return
        super().do_GET()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8090), Handler).serve_forever()

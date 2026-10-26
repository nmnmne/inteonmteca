"""Test-only A/B server: current site, original or revised text renderer.
Run from repository root: python tests/mobile_motion_server.py
/before/ overrides ONLY text-waves.js with git HEAD; /after/ uses working tree.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import subprocess
import os

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
BASELINE = subprocess.check_output(['git', 'show', 'HEAD:text-waves.js'], cwd=ROOT)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        original = self.path
        route = urlsplit(original).path
        if route.startswith('/before/text-waves.js'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', str(len(BASELINE)))
            self.end_headers()
            self.wfile.write(BASELINE)
            return
        for prefix in ('/before/', '/after/'):
            if self.path.startswith(prefix):
                self.path = '/' + self.path[len(prefix):]
                break
        super().do_GET()
        self.path = original

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8081), Handler).serve_forever()

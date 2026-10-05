"""Isolated candidate preview; retain the running local backend and media server."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
from urllib.error import HTTPError
import mimetypes

CANDIDATE = Path(__file__).resolve().parent/'candidate'
FILES = {'index.html','home-player.css','styles.css','script.js','room-resident.js'}

class Preview(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def handle_request(self):
        name = urlsplit(self.path).path.lstrip('/') or 'index.html'
        if self.command=='GET' and name in FILES:
            data=(CANDIDATE/name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type',mimetypes.guess_type(name)[0] or 'application/octet-stream')
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(data)
            return
        headers={key:value for key,value in self.headers.items()
                 if key.lower() in {'range','content-type','cookie','origin'}}
        length=int(self.headers.get('Content-Length','0'))
        data=self.rfile.read(length) if length else None
        request=Request('http://127.0.0.1:8080'+self.path,data=data,headers=headers,method=self.command)
        try:
            response=urlopen(request,timeout=20)
        except HTTPError as error:
            response=error
        with response:
            self.send_response(response.status)
            for key,value in response.headers.items():
                if key.lower() not in {'connection','transfer-encoding','server','date'}:
                    self.send_header(key,value)
            self.end_headers()
            try:
                while chunk:=response.read(65536): self.wfile.write(chunk)
            except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError): pass
    do_GET=handle_request
    do_POST=handle_request

print('Candidate preview: http://127.0.0.1:8765/',flush=True)
ThreadingHTTPServer(('127.0.0.1',8765),Preview).serve_forever()

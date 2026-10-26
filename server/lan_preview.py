"""Serve the site's public files on one LAN address alongside localhost."""
import argparse
import ipaddress
import os
from pathlib import Path
from urllib.parse import unquote

from app import ROOT, serve


def public_file(url_path: str) -> bool:
    parts = Path(unquote(url_path).replace('\\', '/').lstrip('/')).parts
    if not parts:
        return True
    if any(part.startswith('.') for part in parts):
        return False
    if parts[0] == 'api':
        return True
    if parts == ('yard',):
        return True
    suffix = Path(parts[-1]).suffix.lower()
    if len(parts) == 1:
        return suffix in {'.html', '.css', '.js', '.json', '.webmanifest', '.ico'} or parts[0] == 'robots.txt'
    return parts[0] in {'assets', 'media', 'yard'} and suffix in {
        '.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.png', '.jpg',
        '.jpeg', '.webp', '.svg', '.ico', '.gif', '.avif', '.woff', '.woff2',
        '.ttf', '.otf', '.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a',
        '.aac', '.mp4', '.webm', '.glb', '.gltf', '.bin', '.ktx2', '.wasm',
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', required=True)
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    address = ipaddress.ip_address(args.host)
    if address.version != 4 or not address.is_private or address.is_loopback or address.is_unspecified:
        parser.error('--host must be the computer\'s private LAN IPv4 address')
    # The localhost developer login shortcut must not be inherited by LAN users.
    os.environ['INTEONMTECA_DEV'] = '0'
    os.environ['INTEONMTECA_DIRECT_CODE'] = '0'
    server = serve(root=ROOT, host=str(address), port=args.port)
    original = server.RequestHandlerClass

    class LanHandler(original):
        def _forbidden(self, path):
            return super()._forbidden(path) or not public_file(path)

        def list_directory(self, path):
            self.send_error(404, 'Not found')
            return None

    server.RequestHandlerClass = LanHandler
    print(f'inteonmteca LAN  http://{address}:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

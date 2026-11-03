"""Serve the static app locally or through the managed preview launcher."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=4173)
parser.add_argument("--strictPort", action="store_true")
args = parser.parse_args()
directory = Path(__file__).resolve().parents[1] / "dist"
server = ThreadingHTTPServer((args.host, args.port), partial(SimpleHTTPRequestHandler, directory=str(directory)))
print(f"Local: http://{args.host}:{args.port}", flush=True)
server.serve_forever()

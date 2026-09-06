#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
server.py — Editor lokal content.json untuk folder Kisah/

HANYA memakai Python standard library (http.server, json, os, socket,
urllib.parse). Tidak ada dependency eksternal, tidak perlu pip install.

Menjalankan:
    cd ~/HomeLab/MoroalMora/Kisah
    python3 server.py
lalu buka http://127.0.0.1:<port>/editor.html di browser.

Endpoint:
    GET  /api/list                       -> array nama subfolder Kisah/ yang punya content.json
    GET  /api/content?folder=<nama>      -> isi Kisah/<nama>/content.json (raw text)
    POST /api/content?folder=<nama>      -> body JSON, overwrite content.json (indent rapi)
    GET  /editor.html | /editor.css | /editor.js (dan "/" -> editor.html)

Keamanan:
    - Bind HANYA 127.0.0.1 (tidak pernah 0.0.0.0).
    - Param folder divalidasi ketat: tanpa '/', '\\', '..', dan HARUS ada di
      hasil scan folder Kisah/ (whitelist dinamis per-request).
    - Static file dibatasi ke 3 file editor saja.
"""

import json
import os
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
PORT_CANDIDATES = list(range(DEFAULT_PORT, DEFAULT_PORT + 30))  # 8765..8794

# Direktori ini = Kisah/ (lokasi file server.py), supaya path benar dari mana pun dijalankan.
KISAH_DIR = os.path.dirname(os.path.abspath(__file__))

STATIC_FILES = {
    "/": ("editor.html", "text/html; charset=utf-8"),
    "/editor.html": ("editor.html", "text/html; charset=utf-8"),
    "/editor.css": ("editor.css", "text/css; charset=utf-8"),
    "/editor.js": ("editor.js", "application/javascript; charset=utf-8"),
}

CONTENT_FILENAME = "content.json"


# --------------------------------------------------------------------------
# Utilitas folder & validasi (path traversal guard — prioritas tertinggi)
# --------------------------------------------------------------------------

def scan_folders():
    """Subfolder LANGSUNG di dalam Kisah/ yang berisi content.json."""
    result = []
    try:
        with os.scandir(KISAH_DIR) as it:
            for entry in it:
                if entry.is_dir(follow_symlinks=False) and os.path.isfile(
                    os.path.join(entry.path, CONTENT_FILENAME)
                ):
                    result.append(entry.name)
    except OSError:
        pass
    return sorted(result)


def is_safe_folder_name(name):
    """Nama folder aman: non-kosong, bukan '.'/'..', tanpa separator path."""
    if not name or name in (".", ".."):
        return False
    if "/" in name or "\\" in name:
        return False
    if ".." in name:  # defense-in-depth, walau separator sudah dicek
        return False
    return True


def resolve_content_path(folder):
    """
    Kembalikan path absolut Kisah/<folder>/content.json, atau None kalau
    folder invalid / tidak ada di whitelist hasil scan (dynamic allowlist).
    """
    if not is_safe_folder_name(folder):
        return None
    if folder not in scan_folders():  # whitelist dinamis
        return None
    return os.path.join(KISAH_DIR, folder, CONTENT_FILENAME)


# --------------------------------------------------------------------------
# Helper HTTP
# --------------------------------------------------------------------------

def json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "KisahEditor/1.0"

    # --- silence default logging -------------------------------------
    def log_message(self, fmt, *args):
        pass

    def _send_bytes(self, code, body=b"", ctype="application/json; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json(self, code, obj):
        self._send_bytes(code, json_bytes(obj))

    # --- routing ------------------------------------------------------

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)

        if route == "/api/list":
            self._send_json(200, scan_folders())
            return

        if route == "/api/content":
            folder = (query.get("folder") or [""])[0]
            path = resolve_content_path(folder)
            if path is None:
                if is_safe_folder_name(folder):
                    self._send_json(404, {"error": "Folder tidak dikenal: '%s' (tidak ada content.json di subfolder langsung Kisah/)." % folder})
                else:
                    self._send_json(400, {"error": "Nama folder tidak valid: '%s'." % folder})
                return
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
            except OSError as e:
                self._send_json(500, {"error": "Gagal membaca file: %s" % e})
                return
            try:
                json.loads(raw)  # validasi: beri error jelas kalau JSON corrupt
            except ValueError as e:
                self._send_json(
                    500,
                    {"error": "content.json di folder '%s' BUKAN JSON valid: %s. Perbaiki file secara manual dulu." % (folder, e)},
                )
                return
            self._send_bytes(200, raw.encode("utf-8"), "application/json; charset=utf-8")
            return

        if route in STATIC_FILES:
            filename, ctype = STATIC_FILES[route]
            try:
                with open(os.path.join(KISAH_DIR, filename), "rb") as f:
                    self._send_bytes(200, f.read(), ctype)
            except OSError:
                self._send_json(404, {"error": "File tidak ditemukan."})
            return

        self._send_json(404, {"error": "Endpoint tidak dikenal: %s" % route})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/content":
            self._send_json(404, {"error": "Endpoint POST tidak dikenal."})
            return

        query = parse_qs(parsed.query)
        folder = (query.get("folder") or [""])[0]
        path = resolve_content_path(folder)
        if path is None:
            if is_safe_folder_name(folder):
                self._send_json(404, {"error": "Folder tidak dikenal: '%s' (tidak ada content.json di subfolder langsung Kisah/)." % folder})
            else:
                self._send_json(400, {"error": "Nama folder tidak valid: '%s'." % folder})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send_json(400, {"error": "Content-Length tidak valid."})
            return
        if length <= 0:
            self._send_json(400, {"error": "Body JSON kosong."})
            return

        raw_body = self.rfile.read(length)
        try:
            data = json.loads(raw_body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as e:
            self._send_json(400, {"error": "Body bukan JSON valid: %s" % e})
            return

        if not isinstance(data, dict):
            self._send_json(400, {"error": "Isi content.json harus berupa objek JSON (bukan array/string/angka)."})
            return

        try:
            pretty = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
            with open(path, "w", encoding="utf-8") as f:
                f.write(pretty)
        except (OSError, ValueError) as e:
            self._send_json(500, {"error": "Gagal menulis file: %s" % e})
            return

        self._send_json(200, {"ok": True, "folder": folder, "file": "Kisah/%s/content.json" % folder})


# --------------------------------------------------------------------------
# Main: cari port bebas, jalankan
# --------------------------------------------------------------------------

def find_free_port(candidates):
    for port in candidates:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    return None


def main():
    start = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            start = int(sys.argv[1])
        except ValueError:
            pass
    candidates = list(range(start, start + 30))

    port = find_free_port(candidates)
    if port is None:
        print("Tidak ada port bebas di rentang %d-%d. Matikan proses lain lalu coba lagi." % (candidates[0], candidates[-1]), file=sys.stderr)
        sys.exit(1)

    httpd = ThreadingHTTPServer((HOST, port), Handler)
    print("Editor Kisah berjalan di: http://127.0.0.1:%d/editor.html" % port)
    print("(Hanya bind %s — tekan Ctrl+C untuk berhenti)" % HOST)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()

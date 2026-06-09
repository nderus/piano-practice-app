#!/usr/bin/env python3
"""Generate the app icons (pure stdlib PNG, no dependencies).

Draws a rounded dark tile with a small piano keyboard. Run: python3 make_icons.py
"""
import struct, zlib

BG     = (22, 22, 30)     # app background
PANEL  = (124, 131, 255)  # accent (top band)
WHITE  = (236, 236, 245)
BLACK  = (15, 15, 22)

def png(path, size):
    px = bytearray(size * size * 3)

    def put(x, y, c):
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 3
            px[i], px[i+1], px[i+2] = c

    r = int(size * 0.18)  # corner radius for the rounded tile

    # keyboard geometry
    kb_top = int(size * 0.30)
    kb_bot = int(size * 0.78)
    kb_left = int(size * 0.12)
    kb_right = int(size * 0.88)
    n_white = 7
    wkey_w = (kb_right - kb_left) / n_white

    for y in range(size):
        for x in range(size):
            # rounded-corner mask -> transparent-ish (use BG outside radius)
            inside = True
            cx = cy = None
            if x < r and y < r: cx, cy = r, r
            elif x >= size - r and y < r: cx, cy = size - r - 1, r
            elif x < r and y >= size - r: cx, cy = r, size - r - 1
            elif x >= size - r and y >= size - r: cx, cy = size - r - 1, size - r - 1
            if cx is not None and (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                inside = False

            if not inside:
                put(x, y, BG)
                continue

            # accent band at the very top
            if y < int(size * 0.10):
                put(x, y, PANEL)
                continue

            # keyboard area
            if kb_top <= y < kb_bot and kb_left <= x < kb_right:
                # white keys with thin gaps
                rel = (x - kb_left) / wkey_w
                frac = rel - int(rel)
                if frac < 0.06:          # gap between white keys
                    put(x, y, BG)
                else:
                    put(x, y, WHITE)
                # black keys (top ~60% of keyboard), after white keys 0,1,3,4,5
                if y < kb_top + (kb_bot - kb_top) * 0.6:
                    for k in (0, 1, 3, 4, 5):
                        bx = kb_left + (k + 1) * wkey_w
                        bw = wkey_w * 0.6
                        if bx - bw / 2 <= x < bx + bw / 2:
                            put(x, y, BLACK)
                continue

            put(x, y, BG)

    # encode PNG
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(px[y * size * 3:(y + 1) * size * 3])

    def chunk(typ, data):
        c = struct.pack('>I', len(data)) + typ + data
        return c + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(bytes(raw), 9)
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b''))
    print('wrote', path, size)

for name, s in [('icon-180.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
    png(name, s)

#!/usr/bin/env python3
"""Generate the app icons (pure stdlib PNG, no dependencies).

A centered piano keyboard on a navy gradient, in the app's Ocean-blue palette.
Run: python3 make_icons.py
"""
import struct, zlib

TOP    = (22, 38, 64)    # bg gradient (upper)
BOT    = (11, 16, 24)    # bg gradient (lower)
WHITE  = (238, 243, 251) # white keys
BLACK  = (10, 14, 21)    # black keys
ACCENT = (79, 140, 255)  # blue accent

def lerp(a, b, t):
    return (int(a[0]+(b[0]-a[0])*t), int(a[1]+(b[1]-a[1])*t), int(a[2]+(b[2]-a[2])*t))

def png(path, size):
    px = bytearray(size * size * 3)

    def put(x, y, c):
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 3
            px[i], px[i+1], px[i+2] = c

    # background vertical gradient
    bg_row = [lerp(TOP, BOT, y / size) for y in range(size)]
    for y in range(size):
        c = bg_row[y]
        base = y * size * 3
        for x in range(size):
            i = base + x * 3
            px[i], px[i+1], px[i+2] = c

    # keyboard geometry — centered both axes (nudged up slightly for the accent line)
    kb_w = size * 0.64
    kb_h = size * 0.40
    kb_left = (size - kb_w) / 2.0
    kb_right = kb_left + kb_w
    kb_top = size * 0.46 - kb_h / 2.0
    kb_bot = kb_top + kb_h
    n_white = 7
    wkey_w = kb_w / n_white

    # white keys (with thin background gaps)
    for y in range(int(kb_top), int(kb_bot)):
        for x in range(int(kb_left), int(kb_right)):
            frac = ((x - kb_left) / wkey_w) % 1.0
            if frac < 0.05:
                put(x, y, bg_row[y])      # gap shows the background
            else:
                put(x, y, WHITE)

    # black keys (upper ~62%), sitting between white keys 0,1,3,4,5
    bk_bot = kb_top + kb_h * 0.62
    for k in (0, 1, 3, 4, 5):
        bx = kb_left + (k + 1) * wkey_w
        bw = wkey_w * 0.62
        for y in range(int(kb_top), int(bk_bot)):
            for x in range(int(bx - bw / 2), int(bx + bw / 2)):
                put(x, y, BLACK)

    # subtle centered accent line beneath the keyboard
    uy0 = int(kb_bot + size * 0.03)
    uy1 = uy0 + max(2, int(size * 0.013))
    for y in range(uy0, uy1):
        for x in range(int(kb_left), int(kb_right)):
            put(x, y, ACCENT)

    # encode PNG (8-bit RGB)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        raw.extend(px[y * size * 3:(y + 1) * size * 3])

    def chunk(typ, data):
        return struct.pack('>I', len(data)) + typ + data + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))
    print('wrote', path, size)

for name, s in [('icon-180.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
    png(name, s)

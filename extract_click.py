#!/usr/bin/env python3
"""Extract a single, real metronome click — lightly de-clacked.

Source: "Sound Classic Metronome 96.ogg" by Olga Ernst (Wikimedia Commons, CC BY-SA 4.0),
decoded to metronome_test.wav with afconvert. We isolate one real tick and apply only a
gentle low-pass to shave the harsh high "clack" — no synthetic body, keeps the real sound.
Produces click.wav (mono 16-bit). Raise LPF_HZ for more clack, lower it for less.
"""
import wave, array, struct, math

SRC = 'metronome_test.wav'
OUT = 'click.wav'

# ---- PARAMETERS ----
WINDOW_MS = 180      # length of the click
LPF_HZ    = 5000     # gentle high-cut: lower = less clacky, higher = more bite
FADE_MS   = 12

# ---- read source WAV (manual RIFF parse; handles WAVE_FORMAT_EXTENSIBLE) ----
with open(SRC, 'rb') as f:
    data = f.read()
assert data[:4] == b'RIFF' and data[8:12] == b'WAVE', 'not a WAV'
pos, nch, fr, sw, pcm = 12, None, None, None, None
while pos + 8 <= len(data):
    cid = data[pos:pos+4]
    size = struct.unpack('<I', data[pos+4:pos+8])[0]
    body = data[pos+8:pos+8+size]
    if cid == b'fmt ':
        nch, fr = struct.unpack('<H', body[2:4])[0], struct.unpack('<I', body[4:8])[0]
        sw = struct.unpack('<H', body[14:16])[0] // 8
    elif cid == b'data':
        pcm = body
    pos += 8 + size + (size & 1)
assert sw == 2 and pcm is not None, 'expected 16-bit PCM data chunk'

samples = array.array('h'); samples.frombytes(pcm)
mono = samples[0::nch] if nch > 1 else samples

# ---- isolate one tick ----
n = len(mono)
peak = max(abs(s) for s in mono)
pi = next(i for i in range(n) if abs(mono[i]) > 0.30 * peak)   # first strong transient
oi = pi
while oi > 0 and abs(mono[oi]) > 0.02 * peak:                  # back up to the onset
    oi -= 1
start = max(0, oi - int(0.004 * fr))
N = int(WINDOW_MS / 1000 * fr)
xs = [mono[start + i] / 32768.0 if start + i < n else 0.0 for i in range(N)]

# ---- gentle one-pole low-pass to de-clack ----
dt = 1.0 / fr
a = dt / (1.0 / (2 * math.pi * LPF_HZ) + dt)
y = 0.0
flt = [0.0] * N
for i in range(N):
    y += a * (xs[i] - y)
    flt[i] = y

# ---- normalize + fade ----
pk = max(abs(v) for v in flt) or 1.0
g = 0.95 / pk
fade = int(FADE_MS / 1000 * fr)
out = array.array('h', [0] * N)
for i in range(N):
    v = flt[i] * g
    if i > N - fade:
        v *= (N - i) / fade
    out[i] = max(-32768, min(32767, int(v * 32767)))

w = wave.open(OUT, 'wb')
w.setnchannels(1); w.setsampwidth(2); w.setframerate(fr)
w.writeframes(out.tobytes()); w.close()
print(f'wrote {OUT}: {N} samples = {N/fr*1000:.0f} ms @ {fr} Hz, LPF={LPF_HZ} Hz')

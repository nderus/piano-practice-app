# 🎹 Piano Practice

A tiny personal practice app for piano. Works offline on your iPhone (add it to the Home Screen) — no App Store, no install, no ads.

## Features
- **Chord randomizer** — picks a random root + chord type. Toggle types in/out of the pool (triads, maj7, min7, dom7, …), add your own, and optionally randomize the **inversion (rivolto)**.
- **Scale randomizer** — random root + scale type, same editable pool (modes, pentatonic, blues, …).
- **Metronome** — adjustable BPM, tap tempo, beats-per-bar with an accented downbeat. Uses in-browser Web Audio (like Google's metronome), so it won't interfere with the digital piano.
- Everything you customize is **saved on your phone** (localStorage).

## Try it locally
From this folder:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

## Put it on your iPhone
1. Host the folder over HTTPS (easiest: **GitHub Pages** — see below).
2. On the iPhone, open the URL in **Safari**.
3. Tap **Share → Add to Home Screen**.
4. Launch it from the new icon. It now runs **fullscreen and fully offline** — practice in Airplane Mode so the phone's radios don't buzz through the piano speakers.

### Deploy to GitHub Pages
1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages → Source: `main` branch, `/ (root)`**.
3. Your URL will be `https://<username>.github.io/<repo>/`.

## Files
- `index.html` — the whole app (UI + logic).
- `manifest.webmanifest` / `sw.js` — make it installable & offline.
- `icon-*.png` — app icons (regenerate with `python3 make_icons.py`).
- `click.wav` — the metronome tick sample (extract with `python3 extract_click.py`).

## Credits
The metronome click is a single tick extracted from **"Sound Classic Metronome 96"**
by **Olga Ernst**, from Wikimedia Commons, licensed
**[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**.
Source: <https://commons.wikimedia.org/wiki/File:Sound_Classic_Metronome_96.ogg>

## Customizing chord/scale types
In the settings panel, "Intervals" are semitones from the root:
- Major triad = `0,4,7`
- Dominant 7 = `0,4,7,10`
- Major scale = `0,2,4,5,7,9,11`

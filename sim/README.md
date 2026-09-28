# Metronome simulation harness

Dev-only. Nothing in here ships with the app: `sw.js` does not list it, and the
page never loads it.

It runs the **real, unmodified script** from `index.html` inside jsdom, on a
virtual clock, against a fake audio layer that can misbehave the way iOS does.
Then it checks that the metronome keeps its promises.

## Run it

```sh
cd sim
npm install                 # once; jsdom is the only dependency

npm run sim -- --smoke      # does the harness itself work?
npm run sim -- --matrix     # every scripted scenario against the working tree
npm run sim -- --runs 200   # random runs (seeds 1..200)
npm run sim -- --seed 55    # replay one random run, shrunk to its shortest failing form
npm run sim -- --scenario lock-wedged      # one scenario, full trace if it fails
```

Test something other than the working tree:

```sh
npm run sim -- --matrix --rev 1debc9b                       # a git revision (this one is v31)
npm run sim -- --matrix --file fixtures/v32-draft.html      # a file
npm run sim -- --matrix --compare 1debc9b,fixtures/v32-draft.html,tree
```

Other flags: `--steps N` (length of a random run, default 60), `--from N` (first
seed), `--show N` (how many failures to print in full), `--no-shrink`,
`--strict` (unhandled promise rejections fail the run), `--verbose`.

Exit code is 0 when everything passed.

## What is checked

| id | Invariant |
|---|---|
| i | **Liveness.** The app says it is running and the device has been healthy for 5 s: clicks are heard and the pendulum moves. |
| ii | **Recoverability.** At the end of every run the device is made healthy, then Stop and Start are tapped: clicks within 2 s, evenly spaced. |
| iii | One scheduler per engine, no bursts of clicks. |
| iv | No NaN or Infinity in tempo, timeline or visual transforms. |
| v | The toggle never shows `…` for more than 5 s. |
| vi | Nothing sounds after Stop beyond the 0.1 s lookahead. |
| vii | No uncaught exceptions. |
| viii | `APP_VERSION` matches the `sw.js` cache version (static check). |

A click counts as **heard** only when the clock of its audio context actually
passes its start time while that context is running. Scheduling a click on a
frozen clock does not count.

## What the fake device can do

- Interrupt audio and hand the context back running, suspended, still
  `interrupted`, or "running" with a clock that never moves again (`wedge`).
- Hide the page with timers throttled to 1 s or frozen, and animation frames paused.
- Require a touch before a context may run; count a touch only once the finger
  lifts (`strictActivation`).
- Make `resume()`, `decodeAudioData`, `fetch`, `new AudioContext()` or
  `localStorage` hang, reject or throw.
- Freeze the main thread, jump the audio clock, return a stale output timestamp.
- Interrupt audio when the tempo editor opens (`kbInterrupts`). This one is a
  **hypothesis** about iOS, not an observed fact.

## Limits

This cannot reproduce iOS. It proves the app recovers from the kinds of failure
modelled above, in any order the fuzzer finds. Whether a real iPhone produces
them, and when, is answered by the diagnostics log in the app (Settings >
About), not by this harness.

Assumptions baked into the model that have not been verified on a device:

- Which touch events count as a user gesture in WebKit.
- That a new `AudioContext` made outside a gesture stays suspended.
- That `resume()` calls made during an interruption are lost.

## Layout

| File | Purpose |
|---|---|
| `run.mjs` | command line |
| `lib/source.mjs` | loads the app from the tree, a revision or a file |
| `lib/vclock.mjs` | virtual time: timers, animation frames, platform tasks |
| `lib/fake-audio.mjs` | the fake `AudioContext` |
| `lib/platform.mjs` | the fake device: visibility, gestures, faults |
| `lib/env.mjs` | boots the page in jsdom with the fakes installed first |
| `lib/user.mjs` | actions a person or the device can take |
| `lib/oracles.mjs` | the invariants |
| `lib/scenarios.mjs` | scripted scenarios, one per hypothesis |
| `lib/fuzz.mjs` | seeded random runs |
| `lib/shrink.mjs` | reduces a failing run to its shortest form |
| `lib/report.mjs` | failure report |
| `fixtures/` | git-ignored snapshots, e.g. the v32 draft that was never shipped |

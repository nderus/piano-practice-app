/* Scripted scenarios, one per hypothesis. Steps are {dt, kind, ...}: wait dt
   virtual ms, then act. Every scenario ends with the Stop/Start recoverability
   check that Oracles.finish() runs. */

const w = (dt) => ({ dt, kind: 'wait' });
const start = (dt = 200) => ({ dt, kind: 'tapToggle' });
const body = (dt) => ({ dt, kind: 'tapBody' });
const fault = (name, on = true, dt = 0) => ({ dt, kind: 'fault', name, on });
const v3 = o => ({ 'pianoPractice.v3': JSON.stringify(o) });

export const SCENARIOS = [
  { name: 'baseline', about: 'start, change tempo three ways, stop',
    steps: [start(), w(8000), { dt: 0, kind: 'bpmStep', up: true, n: 3 }, w(6000),
      { dt: 0, kind: 'editOpen' }, { dt: 800, kind: 'editType', text: '90' }, { dt: 400, kind: 'editClose', how: 'enter' }, w(6000),
      { dt: 0, kind: 'slider', v: 200 }, w(6000), { dt: 0, kind: 'tapToggle' }, w(1000)] },

  { name: 'double-tap-start', about: 'two taps in a row on Start',
    steps: [{ dt: 200, kind: 'doubleTapToggle' }, w(7000)] },

  { name: 'tab-switch-restart', about: 'switching tab stops it; start again from the Chords bar',
    steps: [start(), w(3000), { dt: 0, kind: 'tap', sel: '.tabs button[data-tab="chords"]' }, { dt: 500, kind: 'tapToggle' }, w(7000)] },

  { name: 'hidden-throttled', about: 'tab hidden 10 s, timers throttled to 1 s, audio keeps going',
    steps: [start(), w(3000), { dt: 0, kind: 'hide', audio: 'keep', timers: 'throttled' }, { dt: 10000, kind: 'show', audio: 'auto' }, body(4000), w(7000)] },

  { name: 'lock-auto', about: 'screen locked 30 s, iOS resumes audio by itself',
    steps: [start(), w(3000), { dt: 0, kind: 'hide' }, { dt: 30000, kind: 'show', audio: 'auto' }, body(4000), w(7000)] },

  { name: 'lock-suspended', about: 'screen locked 30 s, context handed back suspended',
    steps: [start(), w(3000), { dt: 0, kind: 'hide' }, { dt: 30000, kind: 'show', audio: 'suspended' }, body(4000), w(7000)] },

  { name: 'lock-stuck-interrupted', about: 'screen locked 30 s, context still says interrupted',
    steps: [start(), w(3000), { dt: 0, kind: 'hide' }, { dt: 30000, kind: 'show', audio: 'stuck' }, body(4000), w(7000)] },

  { name: 'lock-wedged', about: 'screen locked 30 s, context says running but its clock is frozen',
    steps: [start(), w(3000), { dt: 0, kind: 'hide' }, { dt: 30000, kind: 'show', audio: 'wedge' }, body(4000), w(7000)] },

  { name: 'interrupted-in-place', about: 'audio interrupted while the app stays on screen (Siri, call banner), left interrupted',
    steps: [start(), w(3000), { dt: 0, kind: 'interrupt' }, { dt: 4000, kind: 'endInterrupt', mode: 'stuck' }, body(4000), w(7000)] },

  { name: 'keyboard-interrupts', about: 'HYPOTHESIS: typing a BPM opens the keyboard, which interrupts audio and leaves it interrupted',
    steps: [fault('kbInterrupts'), start(), w(3000), { dt: 0, kind: 'editOpen', end: 'stuck' }, { dt: 1500, kind: 'editType', text: '120' },
      { dt: 500, kind: 'editClose', how: 'enter' }, body(4000), w(7000)] },

  { name: 'keyboard-wedges', about: 'HYPOTHESIS: same, but the context comes back running with a frozen clock',
    steps: [fault('kbInterrupts'), start(), w(3000), { dt: 0, kind: 'editOpen', end: 'wedge' }, { dt: 1500, kind: 'editType', text: '120' },
      { dt: 500, kind: 'editClose', how: 'enter' }, body(4000), w(7000)] },

  { name: 'wedged-old-context', about: 'context alive 5 min, then its clock freezes; new contexts need a tap',
    steps: [start(), w(300000), { dt: 0, kind: 'wedge' }, body(4000), w(7000)] },

  { name: 'wedged-strict-touch', about: 'same, and a touch only counts once the finger lifts',
    policy: { strictActivation: true },
    steps: [start(), w(300000), { dt: 0, kind: 'wedge' }, body(4000), w(7000)] },

  { name: 'wedged-no-gesture-needed', about: 'clock freezes on a platform that starts new contexts freely',
    policy: { newCtxNeedsGesture: false },
    steps: [start(), w(60000), { dt: 0, kind: 'wedge' }, w(9000)] },

  { name: 'decode-hang-on-rebuild', about: 'clock freezes and decoding the click hangs for a while',
    steps: [start(), w(5000), fault('decodeHangs'), { dt: 0, kind: 'wedge' }, fault('decodeHangs', false, 6000), body(3500), w(7000)] },

  { name: 'ctor-throws-on-rebuild', about: 'clock freezes and creating a new context fails for a while',
    steps: [start(), w(5000), fault('ctorThrows'), { dt: 0, kind: 'wedge' }, fault('ctorThrows', false, 5000), body(3500), w(7000)] },

  { name: 'resume-hangs', about: 'suspended, and resume() never settles for a while',
    steps: [start(), w(5000), fault('resumeHangs'), { dt: 0, kind: 'suspendAll' }, fault('resumeHangs', false, 5000), body(3500), w(7000)] },

  { name: 'fetch-hang-first-start', about: 'the click sound never arrives on the first Start',
    steps: [fault('fetchHangs'), start(), w(6000), fault('fetchHangs', false), { dt: 4000, kind: 'tapToggle' }, w(7000)] },

  { name: 'decode-fails-first-start', about: 'decoding fails on the first Start, works on the second',
    steps: [fault('decodeFails'), start(), w(3000), fault('decodeFails', false), { dt: 1000, kind: 'tapToggle' }, w(7000)] },

  { name: 'stale-output-timestamp', about: 'getOutputTimestamp stops updating while the audio is fine',
    steps: [start(), w(3000), { dt: 0, kind: 'staleTs', value: 2.5 }, body(4000), w(7000)] },

  { name: 'clock-jump', about: 'audio clock leaps forward 10 minutes',
    steps: [start(), w(3000), { dt: 0, kind: 'clockJump', sec: 600 }, body(4000), w(7000)] },

  { name: 'main-thread-stall', about: 'page frozen for 3 s',
    steps: [start(), w(3000), { dt: 0, kind: 'stall', ms: 3000 }, body(4000), w(7000)] },

  { name: 'storage-throws', about: 'localStorage refuses writes',
    steps: [fault('storageThrows'), start(3200), w(2000), { dt: 0, kind: 'bpmStep', up: true, n: 2 }, w(7000)] },

  { name: 'rhythm-wedged', about: 'polyrhythm trainer running when the clock freezes',
    steps: [{ dt: 200, kind: 'tap', sel: '.tabs button[data-tab="rhythm"]' }, { dt: 300, kind: 'tap', sel: '#rhythm-toggle' }, w(6000),
      { dt: 0, kind: 'wedge' }, body(4000), w(7000)] },

  { name: 'relaunch-in-reference', about: 'app was closed while Chords showed Reference',
    storage: v3({ chordMode: 'reference' }), steps: [start(), w(7000)] },

  { name: 'corrupt-bpm', about: 'saved tempo is not a number',
    storage: v3({ bpm: 'abc', beats: 'x', subdivision: 9, rhBpm: null, recentBpms: [null, 'q', 1e9] }), steps: [start(), w(7000)] },

  { name: 'type-garbage', about: 'typing nonsense into the tempo editor while running',
    steps: [start(), w(2000),
      ...['', 'abc', '0', '999', '-5', '1e9', '12.7', ' 80 '].flatMap(text => [{ dt: 300, kind: 'editOpen' }, { dt: 200, kind: 'editType', text }, { dt: 200, kind: 'editClose', how: 'enter' }]),
      w(7000)] },
];

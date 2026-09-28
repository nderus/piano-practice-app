/* Seeded random runs. The whole step list is generated up front from the seed,
   so a run replays exactly and can be shrunk by deleting steps. Steps that do
   not apply when their turn comes (button not on screen, no editor open) are
   simply no-ops. */

import { rng } from './env.mjs';

const TEXTS = ['', 'abc', '0', '40', '60', '90', '120', '200', '240', '999', '-5', '1e9', '12.7', ' 80 ', '٣٣'];
const TABS = ['metronome', 'chords', 'scales', 'rhythm'];
const SHOWS = ['auto', 'auto', 'suspended', 'stuck', 'wedge'];
const FAULTS = ['resumeHangs', 'resumeRejects', 'decodeHangs', 'decodeHangsUnlessRunning', 'decodeFails', 'fetchHangs', 'fetchRejects',
  'ctorThrows', 'storageThrows', 'gestureOnly', 'kbInterrupts', 'staleOutputTs'];

export function generate(seed, n = 60) {
  const r = rng(seed), int = (a, b) => a + Math.floor(r() * (b - a + 1)), pick = a => a[Math.floor(r() * a.length)];
  const policy = { newCtxNeedsGesture: r() < 0.7, strictActivation: r() < 0.3, tapBlurs: r() < 0.5, webkitOnly: r() < 0.2 };
  const storage = {};
  if (r() < 0.3) storage['pianoPractice.v3'] = JSON.stringify({
    bpm: pick([40, 60, 97, 240, 0, 'x', null, 1e9]), beats: pick([1, 4, 7, 12, 0, 99]), subdivision: pick([1, 2, 3, 4, 0, 7]),
    chordMode: pick(['practice', 'reference']), recentBpms: [int(40, 240), int(40, 240)], rhBpm: pick([30, 52, 200, 'y']),
    autoAdv: pick([0, 1, 2, 4]),
  });
  const gap = () => (r() < 0.12 ? int(6000, 12000) : r() < 0.4 ? int(20, 250) : int(250, 2500));
  const steps = [];
  const push = (kind, extra = {}, dt = gap()) => steps.push({ dt, kind, ...extra });
  const table = [
    [14, () => push('tapToggle')],
    [3, () => push('doubleTapToggle')],
    [8, () => push('bpmStep', { up: r() < 0.5, n: int(1, 6) })],
    [4, () => push('slider', { v: int(40, 240) })],
    [3, () => push('tapNth', { sel: '#bpm-recents .chip', i: int(0, 2) })],
    [3, () => { const k = int(2, 5); for (let i = 0; i < k; i++) push('tap', { sel: '#tap-tempo' }, i ? int(200, 1200) : gap()); }],
    [9, () => {
      push('editOpen', { end: pick(['stuck', 'suspended', 'wedge', 'auto']) });
      push('editType', { text: pick(TEXTS) }, int(100, 2000));
      if (r() < 0.8) push('editClose', { how: pick(['enter', 'enter', 'blur', 'escape']) }, int(50, 1500));
    }],
    [3, () => push('tap', { sel: pick(['#sig-inc', '#sig-dec']) })],
    [3, () => push('tapNth', { sel: '#subseg button', i: int(0, 3) })],
    [8, () => push('tap', { sel: `.tabs button[data-tab="${pick(TABS)}"]` })],
    [2, () => push('tap', { sel: '#gear-btn' })],
    [3, () => push('tap', { sel: `#chord-mode button[data-cmode="${pick(['practice', 'reference'])}"]` })],
    [4, () => push('tap', { sel: '#rhythm-toggle' })],
    [3, () => push('tap', { sel: pick(['#rx-inc', '#rx-dec', '#ry-inc', '#ry-dec', '#rb-inc', '#rb-dec']) })],
    [3, () => push('tap', { sel: pick(['#chord-next', '#scale-next']) })],
    [2, () => push('tapNth', { sel: pick(['#chord-adv .chip', '#scale-adv .chip']), i: int(0, 3) })],
    [9, () => push('tapBody')],
    [7, () => push('wait', {}, int(6000, 12000))],
    [8, () => {
      push('hide', { audio: pick(['interrupt', 'interrupt', 'suspend', 'keep']), timers: pick(['frozen', 'frozen', 'throttled', 'normal']) });
      push('show', { audio: pick(SHOWS) }, int(500, 40000));
    }],
    [5, () => { push('interrupt'); push('endInterrupt', { mode: pick(SHOWS) }, int(300, 8000)); }],
    [3, () => push('wedge')],
    [2, () => push('suspendAll')],
    [2, () => push('stall', { ms: int(200, 5000) })],
    [1, () => push('clockJump', { sec: pick([0.3, 5, 600]) })],
    [5, () => {
      const name = pick(FAULTS);
      if (name === 'staleOutputTs') push('staleTs', { value: pick([0, 0.5, 3, 1e6]) }); else push('fault', { name, on: true });
      push('fault', { name, on: false }, int(500, 9000));
    }],
  ];
  const total = table.reduce((a, [wt]) => a + wt, 0);
  while (steps.length < n) {
    let x = r() * total;
    for (const [wt, f] of table) { if ((x -= wt) < 0) { f(); break; } }
  }
  return { seed, policy, storage, steps };
}

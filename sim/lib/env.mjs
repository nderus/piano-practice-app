/* Boots the real page in jsdom with the fakes installed before its script runs. */

import { JSDOM, VirtualConsole } from 'jsdom';
import { VClock } from './vclock.mjs';
import { Platform } from './platform.mjs';

export function rng(seed) {                      // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* App internals are top-level let/const in a classic script: not properties of
   window, but visible to code evaluated in the page's global scope. */
const NAMES = ['metRunning', 'metStarting', 'nextNoteTime', 'beatInBar', 'subIndex', 'timerId', 'pendPhase', 'pendLast', 'pendRAF',
  'rhRunning', 'rhStarting', 'rhTimer', 'rhRAF', 'rhStart', 'rhNextA', 'rhNextB', 'recovering', 'gestureArmed', 'audioCtx',
  'clickBuffer', 'APP_VERSION'];
const STATE = ['bpm', 'beats', 'subdivision', 'rhBpm', 'rhX', 'rhY', 'rhA', 'rhB', 'autoAdv', 'chordMode', 'recentBpms'];
const PEEK = '(function(){var g=function(f){try{return f()}catch(e){return undefined}};return function(){return {'
  + NAMES.map(n => `${n}:g(function(){return ${n}})`).join(',') + ','
  + STATE.map(n => `${n}:g(function(){return state.${n}})`).join(',') + '}}})()';

export function boot(src, { seed = 1, policy = {}, storage = {}, fps = 60 } = {}) {
  const clock = new VClock({ fps });
  const P = new Platform(clock, policy);
  const errors = clock.errors;
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => {
    if (/^Not implemented/.test(e.message || '')) return;
    errors.push({ at: clock.now, where: 'page', error: e.detail || e });
  });
  const dom = new JSDOM(src.html, {
    url: 'https://sim.local/app/',
    runScripts: 'dangerously',
    virtualConsole: vc,
    beforeParse(win) {
      clock.install(win);
      P.install(win, { wav: src.wav, storage });
      win.Math.random = rng(seed ^ 0x9e3779b9);
    },
  });
  const win = dom.window, doc = win.document;
  let peekFn = null;
  try { peekFn = win.eval(PEEK); } catch (e) { errors.push({ at: 0, where: 'peek', error: e }); }
  const env = {
    src, seed, clock, P, dom, win, doc, errors,
    peek: () => (peekFn ? peekFn() : {}),
    $: sel => doc.querySelector(sel),
    $$: sel => [...doc.querySelectorAll(sel)],
    storage: () => { const o = {}; for (let i = 0; i < win.localStorage.length; i++) { const k = win.localStorage.key(i); o[k] = win.localStorage.getItem(k); } return o; },
    close: () => { try { win.close(); } catch (e) {} },
  };
  return env;
}

/* kill the app and launch it again, keeping what it saved */
export function relaunch(env, opts = {}) {
  const storage = env.storage();
  env.close();
  return boot(env.src, { seed: env.seed, policy: env.P.policy, storage, ...opts });
}

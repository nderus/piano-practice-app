/* The simulated device: visibility, user activation, audio session, faults.
   Everything that disturbs the app is logged, and tells the oracles to restart
   their "has been healthy for N seconds" timer. */

import { makeAudioContextClass } from './fake-audio.mjs';

export const PLATFORM_FAULTS = ['resumeHangs', 'resumeRejects', 'decodeHangs', 'decodeHangsUnlessRunning',
  'decodeFails', 'fetchHangs', 'fetchRejects', 'ctorThrows'];

export class Platform {
  constructor(clock, policy = {}) {
    this.clock = clock;
    this.policy = { newCtxNeedsGesture: true, strictActivation: false, tapBlurs: true, webkitOnly: false, ...policy };
    this.faults = {};
    this.visible = true;
    this.interrupted = false;
    this.activation = false;
    this.contexts = []; this.ctxSeq = 0;
    this.heard = []; this.scheduled = 0;
    this.events = [];
    this.alerts = [];
    this.lastTap = -Infinity;
    this.disturbedAt = -Infinity;
    this.win = null;
    this.AudioContext = makeAudioContextClass(this);
  }

  log(ev, d = {}) { this.events.push({ t: Math.round(this.clock.now), ev, ...d }); if (this.events.length > 4000) this.events.splice(0, 1000); }
  disturb(why) { this.disturbedAt = this.clock.now; this.log('disturb', { why }); }

  healthy() {
    if (!this.visible || this.interrupted || this.clock.mode !== 'normal') return false;
    return !PLATFORM_FAULTS.some(f => this.faults[f]);
  }
  collect() { for (const c of this.contexts) c._collect(); return this.heard; }
  live() { return this.contexts.filter(c => c.state !== 'closed'); }

  setFault(name, on = true) {
    if (!!this.faults[name] === !!on) return;
    this.faults[name] = !!on;
    this.disturb((on ? '+' : '-') + name);
  }
  clearFaults() { for (const k of Object.keys(this.faults)) if (this.faults[k]) this.setFault(k, false); }

  /* ---- audio session ---- */
  interrupt(why = 'interrupt') {
    if (this.interrupted) return;
    this.interrupted = true; this.disturb(why);
    for (const c of this.live()) { c.prev = c.state; c._to('interrupted'); }
  }
  /* how iOS hands the contexts back:
     auto      -> running again by itself
     suspended -> left suspended, a resume() is needed
     stuck     -> still says 'interrupted' until somebody calls resume()
     wedge     -> says 'running' but the clock never moves again */
  endInterrupt(mode = 'auto') {
    if (!this.interrupted) return;
    this.interrupted = false; this.disturb('endInterrupt:' + mode);
    for (const c of this.live()) {
      if (c.state !== 'interrupted') continue;
      const wasRunning = c.prev === 'running';
      const held = c.waiting.splice(0);
      if (mode === 'wedge' && wasRunning) { c.wedged = true; c._to('running'); held.forEach(w => w.res()); }
      else if (mode === 'auto' && wasRunning) { c._to('running'); held.forEach(w => w.res()); }
      else if (mode === 'suspended' || !wasRunning) c._to('suspended');
      /* stuck: nothing happens, and the resume() calls made meanwhile are lost */
    }
  }
  wedge() {
    this.disturb('wedge');
    for (const c of this.live()) if (c.state === 'running') { c._setRate(0); c.wedged = true; this.log('ctx.wedged', { ctx: c.id }); }
  }
  suspendAll() {
    this.disturb('suspendAll');
    for (const c of this.live()) if (c.state === 'running') c._to('suspended');
  }
  clockJump(sec) {
    this.disturb('clockJump:' + sec);
    for (const c of this.live()) c._jump(sec);
  }

  /* ---- visibility ---- */
  _dispatch(target, type) {
    try { target.dispatchEvent(new this.win.Event(type, { bubbles: type === 'visibilitychange' })); }
    catch (e) { this.clock.errors.push({ at: this.clock.now, where: 'event:' + type, error: e }); }
  }
  hide({ audio = 'interrupt', timers = 'frozen' } = {}) {
    if (!this.visible) return;
    this.visible = false; this.disturb('hide:' + audio + ':' + timers);
    this._dispatch(this.win.document, 'visibilitychange');
    this._dispatch(this.win, 'blur');
    this.clock.mode = timers; this.clock.rafPaused = true;
    if (audio === 'interrupt') this.interrupt('hide');
    else if (audio === 'suspend') for (const c of this.live()) if (c.state === 'running') { c.prev = 'running'; c._to('suspended'); }
  }
  show({ audio = 'auto' } = {}) {
    if (this.visible) return;
    this.clock.mode = 'normal'; this.clock.rafPaused = false;
    this.visible = true; this.disturb('show:' + audio);
    if (this.interrupted) this.endInterrupt(audio);
    else for (const c of this.live()) {
      if (c.state !== 'suspended' || c.prev !== 'running') continue;
      if (audio === 'auto') c._to('running');
      else if (audio === 'wedge') { c.wedged = true; c._to('running'); }
    }
    this._dispatch(this.win.document, 'visibilitychange');
    this._dispatch(this.win, 'pageshow');
    this._dispatch(this.win, 'focus');
  }
  stall(ms) { this.clock.stall(ms); this.disturb('stall:' + ms); }   // the calm starts when the stall ends

  /* ---- installed into the page before its script runs ---- */
  install(win, { wav, storage = {} } = {}) {
    this.win = win;
    const P = this, clock = this.clock;
    if (!this.policy.webkitOnly) win.AudioContext = this.AudioContext;
    win.webkitAudioContext = this.AudioContext;

    win.fetch = url => new Promise((res, rej) => {
      P.log('fetch', { url: String(url) });
      if (P.faults.fetchHangs) return;
      clock.task(6, () => {
        if (P.faults.fetchRejects) return rej(new TypeError('Load failed'));
        res({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength)) });
      }, 'fetch');
    });

    const doc = win.document;
    Object.defineProperty(doc, 'visibilityState', { get: () => (P.visible ? 'visible' : 'hidden'), configurable: true });
    Object.defineProperty(doc, 'hidden', { get: () => !P.visible, configurable: true });

    const nav = win.navigator;
    const def = (o, k, v) => Object.defineProperty(o, k, { value: v, configurable: true, writable: true });
    def(nav, 'wakeLock', { request: () => new Promise(res => clock.task(3, () => {
      const ls = [];
      res({ released: false, release() { this.released = true; ls.forEach(f => f()); return Promise.resolve(); }, addEventListener: (t, f) => ls.push(f) });
    }, 'wakeLock')) });
    def(nav, 'audioSession', { type: 'auto' });

    win.alert = m => { P.alerts.push(String(m)); P.log('alert', { m: String(m) }); };
    win.confirm = () => false;
    win.prompt = () => null;

    for (const [k, v] of Object.entries(storage)) win.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    const proto = Object.getPrototypeOf(win.localStorage);
    const realSet = proto.setItem;
    proto.setItem = function (k, v) {
      if (P.faults.storageThrows) throw new win.DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return realSet.call(this, k, v);
    };
  }
}

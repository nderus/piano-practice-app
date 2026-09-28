/* Virtual clock. Drives the app's timers and requestAnimationFrame, plus a
   separate queue of platform tasks (audio state changes, decode callbacks...),
   so throttling the page's timers never delays what the "OS" does. */

const flush = () => new Promise(r => setImmediate(r));   // drains every pending promise chain

export class VClock {
  constructor({ fps = 60 } = {}) {
    this.now = 0;              // virtual ms since page load
    this.seq = 0;
    this.timers = new Map();   // app setTimeout / setInterval
    this.rafs = new Map();
    this.tasks = [];           // platform tasks
    this.mode = 'normal';      // app timers: normal | throttled | frozen
    this.rafPaused = false;
    this.frame = 1000 / fps;
    this.errors = [];          // exceptions thrown by callbacks
    this.ran = 0;
  }

  /* ---- what the page sees ---- */
  install(win) {
    const self = this;
    win.setTimeout = (cb, ms, ...a) => self._add(cb, ms, false, a);
    win.setInterval = (cb, ms, ...a) => self._add(cb, ms, true, a);
    win.clearTimeout = win.clearInterval = id => { self.timers.delete(id); };
    win.requestAnimationFrame = cb => { const id = ++self.seq; self.rafs.set(id, { id, cb, asked: self.now }); return id; };
    win.cancelAnimationFrame = id => { self.rafs.delete(id); };
    Object.defineProperty(win, 'performance', { value: { now: () => self.now }, configurable: true });
    const epoch = 1790000000000;
    win.Date.now = () => epoch + Math.floor(self.now);
  }
  _add(cb, ms, repeat, args) {
    if (typeof cb !== 'function') return 0;
    const id = ++this.seq;
    const delay = Math.max(repeat ? 1 : 0, +ms || 0);
    this.timers.set(id, { id, cb, args, delay, repeat, due: this.now + delay });
    return id;
  }

  /* ---- what the platform uses ---- */
  task(ms, fn, label = '') { this.tasks.push({ id: ++this.seq, due: this.now + ms, fn, label }); }

  liveIntervals(name) {
    let n = 0;
    for (const t of this.timers.values()) if (t.repeat && t.cb.name === name) n++;
    return n;
  }

  _effDue(t) {
    if (this.mode === 'frozen') return Infinity;
    if (this.mode === 'throttled') return Math.ceil(t.due / 1000) * 1000;
    return t.due;
  }
  _rafDue(r) {
    if (this.rafPaused || this.mode === 'frozen') return Infinity;
    return (Math.floor(r.asked / this.frame + 1e-6) + 1) * this.frame;   // epsilon: never the frame we are in
  }
  _next(limit) {
    let best = null;
    const consider = (kind, due, id, ref) => {
      if (due > limit) return;
      if (!best || due < best.due || (due === best.due && id < best.id)) best = { kind, due, id, ref };
    };
    for (const t of this.tasks) consider('task', t.due, t.id - 1e9, t);   // platform first on ties
    for (const t of this.timers.values()) consider('timer', this._effDue(t), t.id, t);
    for (const r of this.rafs.values()) consider('raf', this._rafDue(r), r.id, r);
    return best;
  }
  _run(ev) {
    this.ran++;
    try {
      if (ev.kind === 'task') {
        this.tasks.splice(this.tasks.indexOf(ev.ref), 1);
        ev.ref.fn();
      } else if (ev.kind === 'timer') {
        const t = ev.ref;
        if (t.repeat) t.due = this.now + t.delay;      // browsers do not catch up missed ticks
        else this.timers.delete(t.id);
        t.cb(...t.args);
      } else {
        this.rafs.delete(ev.ref.id);
        ev.ref.cb(this.now);
      }
    } catch (e) {
      this.errors.push({ at: this.now, where: ev.kind + ':' + (ev.ref.cb?.name || ev.ref.label || '?'), error: e });
    }
  }

  /* Advance virtual time, running everything that falls due. */
  async advance(ms) {
    const target = this.now + ms;
    let guard = 0;
    for (;;) {
      const ev = this._next(target);
      if (!ev) break;
      if (ev.due > this.now) this.now = ev.due;
      this._run(ev);
      await flush();
      if (++guard > 2e6) throw new Error('vclock: runaway callbacks');
    }
    this.now = target;
    await flush();
  }

  /* Main thread blocked: time passes, nothing of the page's runs. */
  stall(ms) { this.now += ms; }
}

export { flush };

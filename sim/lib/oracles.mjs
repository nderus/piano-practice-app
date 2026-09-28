/* The invariants. sample() runs every 50 virtual ms and after every action;
   finish() is the end-of-run "can the person still get it going?" check.

   i    liveness        running + healthy device for 5 s  => clicks heard, visuals moving
   ii   recoverability  Stop then Start on a healthy device => clicks within 2 s, evenly spaced
   iii  one scheduler per engine, no bursts
   iv   no NaN / Infinity in tempo, timeline or transforms
   v    the toggle never sits on '…' for more than 5 s
   vi   nothing sounds after Stop beyond the lookahead
   vii  no uncaught exceptions */

import { act, tap, visibleToggle, editor, DEVICE, SEL } from './user.mjs';
import { flush } from './vclock.mjs';

const QUIET = 5000;        // ms of calm before liveness is judged
const TAP_LAG = 3000;      // a tap only counts as "the person noticed" this long after a disturbance
const SAMPLE = 50;

export class Oracles {
  constructor(env, { strictRejections = false } = {}) {
    this.env = env; this.fail = null; this.strict = strictRejections;
    this.heardAt = 0;
    this.lastAction = -Infinity;
    this.met = { on: false, started: -Infinity, stopped: null, dots: null, vis: '', visAt: 0, recent: [] };
    this.rh = { on: false, started: -Infinity, stopped: null, dots: null, vis: '', visAt: 0 };
    this.checked = { i: 0, ii: 0 };
  }
  bad(id, msg) { if (!this.fail) this.fail = { id, msg, at: Math.round(this.env.clock.now) }; }
  noteAction(a, applied) { if (applied && !DEVICE.has(a.kind)) this.lastAction = this.env.clock.now; }

  sample() {
    if (this.fail) return;
    const { env } = this, { clock, P } = env, now = clock.now;
    if (env.errors.length) { const e = env.errors[0]; return this.bad('vii', `uncaught in ${e.where}: ${e.error && e.error.message || e.error}`); }
    const s = env.peek();

    /* iv */
    if (typeof s.bpm !== 'number' || !Number.isFinite(s.bpm)) return this.bad('iv', 'state.bpm is ' + String(s.bpm));
    for (const k of ['beats', 'subdivision', 'rhBpm', 'rhX', 'rhY', 'nextNoteTime', 'pendPhase', 'rhNextA', 'rhNextB', 'rhStart'])
      if (typeof s[k] === 'number' ? !Number.isFinite(s[k]) : (s[k] !== undefined && s[k] !== null && ['beats', 'subdivision', 'rhBpm', 'rhX', 'rhY'].includes(k)))
        return this.bad('iv', k + ' is ' + String(s[k]));
    const arm = env.$('.js-pend-arm'), head = env.$('#rplayhead');
    const armT = arm ? arm.style.transform : '', headT = head ? head.style.left : '';
    if (/NaN|Infinity/.test(armT + headT)) return this.bad('iv', 'visual transform is ' + armT + ' / ' + headT);

    /* iii */
    if (clock.liveIntervals('scheduler') > 1) return this.bad('iii', clock.liveIntervals('scheduler') + ' metronome schedulers alive');
    if (clock.liveIntervals('rhScheduler') > 1) return this.bad('iii', clock.liveIntervals('rhScheduler') + ' rhythm schedulers alive');

    /* running state transitions */
    for (const [e, on] of [[this.met, !!s.metRunning], [this.rh, !!s.rhRunning]]) {
      if (on && !e.on) { e.started = now; e.stopped = null; }
      if (!on && e.on) e.stopped = now;
      e.on = on;
    }
    if (armT !== this.met.vis) { this.met.vis = armT; this.met.visAt = now; }
    if (headT !== this.rh.vis) { this.rh.vis = headT; this.rh.visAt = now; }

    /* newly heard clicks: vi and bursts */
    const heard = P.collect();
    for (; this.heardAt < heard.length; this.heardAt++) {
      const c = heard[this.heardAt];
      const e = c.engine === 'met' ? this.met : this.rh;
      if (!e.on && e.stopped !== null && c.vtime > e.stopped + 200)
        return this.bad('vi', `${c.engine} click heard ${Math.round(c.vtime - e.stopped)} ms after Stop`);
      if (c.engine === 'met' && c.main) {
        const r = this.met.recent; r.push(c.vtime); if (r.length > 3) r.shift();
        if (r.length === 3 && r[2] - r[0] < 100) return this.bad('iii', 'burst: 3 beats within ' + Math.round(r[2] - r[0]) + ' ms');
      }
    }

    /* v */
    for (const [e, sel] of [[this.met, SEL.toggle], [this.rh, SEL.rhythm]]) {
      const el = env.$(sel), dots = el && el.textContent.trim() === '…';
      if (!dots) e.dots = null; else if (e.dots === null) e.dots = now;
      if (e.dots !== null && now - e.dots > 5000) return this.bad('v', sel + ' has shown … for ' + Math.round((now - e.dots) / 1000) + ' s');
    }

    /* i */
    if (!P.healthy()) return;
    const needTap = P.policy.newCtxNeedsGesture || P.faults.gestureOnly;
    if (needTap && P.lastTap < P.disturbedAt + TAP_LAG) return;
    const quiet = Math.max(P.disturbedAt, this.lastAction);
    if (now - quiet < QUIET) return;
    if (s.metRunning && now - this.met.started >= QUIET) {
      this.checked.i++;
      const w = Math.max(1200, 2 * 60000 / s.bpm + 300);
      const last = lastHeard(heard, 'met');
      if (last === null || now - last > w) return this.bad('i', `metronome shows running but no click heard for ${last === null ? 'ever' : Math.round(now - last) + ' ms'} (device healthy for ${Math.round((now - quiet) / 1000)} s)`);
      if (now - this.met.visAt > 600) return this.bad('i', `pendulum has not moved for ${Math.round(now - this.met.visAt)} ms while clicks are sounding`);
    }
    if (s.rhRunning && now - this.rh.started >= QUIET) {
      this.checked.i++;
      if (s.rhA || s.rhB) {
        const w = Math.max(1200, 2 * 60000 / s.rhBpm + 300);
        const last = lastHeard(heard, 'rhythm');
        if (last === null || now - last > w) return this.bad('i', `rhythm shows running but no click heard for ${last === null ? 'ever' : Math.round(now - last) + ' ms'}`);
      }
      if (now - this.rh.visAt > 600) return this.bad('i', `rhythm playhead has not moved for ${Math.round(now - this.rh.visAt)} ms`);
    }
  }

  async advance(ms) {
    const { clock } = this.env;
    let left = ms;
    while (left > 0 && !this.fail) {
      const d = Math.min(SAMPLE, left);
      await clock.advance(d);
      left -= d;
      this.sample();
    }
  }
  async step(a) {
    await this.advance(a.dt || 0);
    if (this.fail) return;
    let applied = false;
    try { applied = act(this.env, a); }
    catch (e) { this.env.errors.push({ at: this.env.clock.now, where: 'action:' + a.kind, error: e }); }
    this.noteAction(a, applied);
    await flush();
    this.sample();
  }

  /* ii: whatever happened, a healthy device plus Stop, Start must bring the clicks back */
  async finish() {
    if (this.fail) return;
    const { env } = this, { P, clock } = env;
    P.clearFaults();
    if (!P.visible) P.show({ audio: 'stuck' });
    if (P.interrupted) P.endInterrupt('stuck');
    if (editor(env)) act(env, { kind: 'editClose', how: 'blur' });
    await this.advance(1000);
    if (this.fail) return;
    if (!visibleToggle(env)) { tap(env, SEL.tab('metronome')); await this.advance(300); }
    if (env.peek().rhRunning) { tap(env, SEL.tab('metronome')); await this.advance(300); }
    const tgl = visibleToggle(env);
    if (!tgl) return this.bad('ii', 'no metronome toggle reachable');
    if (env.peek().metRunning || tgl.textContent.trim() === '…') {
      tap(env, tgl); this.lastAction = clock.now;
      await this.advance(600);
      if (this.fail) return;
      if (env.peek().metRunning) return this.bad('ii', 'tapped Stop, still running');
    }
    tap(env, tgl); this.lastAction = clock.now;
    const t0 = clock.now;
    const bpm = env.peek().bpm, sub = env.peek().subdivision || 1, tick = 60000 / bpm / sub;
    await this.advance(2000);
    if (this.fail) return;
    this.checked.ii++;
    const s = env.peek();
    if (!s.metRunning) return this.bad('ii', `tapped Start, not running after 2 s (button says "${tgl.textContent.trim()}")`);
    const mine = () => P.collect().filter(c => c.engine === 'met' && c.vtime >= t0);
    if (!mine().length) return this.bad('ii', 'tapped Start, running, but no click heard within 2 s');
    await this.advance(3000 + 2 * tick);
    if (this.fail) return;
    const ts = mine().map(c => c.vtime);
    const want = Math.floor(3000 / tick);
    if (ts.length < want) return this.bad('ii', `after restart heard ${ts.length} clicks in 5 s, expected at least ${want}`);
    for (let i = 1; i < ts.length; i++)
      if (Math.abs(ts[i] - ts[i - 1] - tick) > 3) return this.bad('ii', `after restart click spacing ${(ts[i] - ts[i - 1]).toFixed(1)} ms, expected ${tick.toFixed(1)}`);
  }
}

function lastHeard(heard, engine) {
  for (let i = heard.length - 1; i >= 0; i--) if (heard[i].engine === engine) return heard[i].vtime;
  return null;
}

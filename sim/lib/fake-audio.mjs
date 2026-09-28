/* Fake Web Audio, modelled on how WebKit behaves on iOS as far as we know it.
   Every context has its own clock, piecewise linear against virtual time. A
   click only counts as HEARD when that clock actually passes its start time. */

class Param { constructor(v) { this.value = v; } }

class Node_ {
  constructor(ctx, kind) { this.context = ctx; this.kind = kind; this._out = null; }
  connect(n) { this._out = n; return n; }
  disconnect() { this._out = null; }
}

export function makeAudioContextClass(P) {
  const clock = P.clock;

  return class FakeAudioContext {
    constructor() {
      if (P.faults.ctorThrows) throw new Error('NotSupportedError: audio context limit');
      this.id = ++P.ctxSeq;
      this.state = 'suspended';
      this.rate = 0; this.t0 = 0; this.v0 = clock.now;
      this.wedged = false; this.everRan = false; this.prev = 'suspended';
      this.sampleRate = 44100;
      this.outputLatency = 0.012;
      this.onstatechange = null;
      this.destination = new Node_(this, 'destination');
      this.pending = [];            // scheduled, not yet heard
      this.waiting = [];            // resume() promises iOS is sitting on
      this.born = clock.now;
      P.contexts.push(this);
      P.log('ctx.new', { ctx: this.id, act: P.activation });
    }

    get currentTime() { return this.t0 + (this.rate ? (clock.now - this.v0) / 1000 : 0); }

    _collect() {
      if (!this.rate || !this.pending.length) return;
      const t = this.currentTime;
      this.pending = this.pending.filter(c => {
        if (c.when > t) return true;
        const vtime = Math.max(c.schedV, this.v0 + Math.max(0, c.when - this.t0) * 1000);
        P.heard.push({ ...c, vtime, ctx: this.id });   // a copy: the original stays identifiable for stop()
        return false;
      });
    }
    _setRate(r) { this._collect(); this.t0 = this.currentTime; this.v0 = clock.now; this.rate = r; }
    _to(state) {
      if (this.state === 'closed') return;
      this._setRate(state === 'running' && !this.wedged ? 1 : 0);
      if (state === 'running' && !this.wedged) this.everRan = true;
      const changed = state !== this.state;
      this.state = state;
      if (state === 'closed') this.pending = [];
      P.log('ctx.state', { ctx: this.id, state, wedged: this.wedged });
      if (changed) clock.task(0, () => { if (typeof this.onstatechange === 'function') this.onstatechange({ type: 'statechange', target: this }); }, 'statechange');
    }
    _jump(sec) { this._collect(); this.t0 = this.currentTime + sec; this.v0 = clock.now; }

    _allowed() {
      if (P.activation) return true;
      if (P.faults.gestureOnly) return false;
      return this.everRan ? true : !P.policy.newCtxNeedsGesture;
    }

    resume() {
      P.log('ctx.resume', { ctx: this.id, state: this.state, act: P.activation });
      if (this.state === 'closed') return Promise.reject(new Error('InvalidStateError: closed'));
      if (P.faults.resumeRejects) return Promise.reject(new Error('NotAllowedError'));
      return new Promise((res, rej) => {
        if (P.faults.resumeHangs) return;                       // never settles
        if (P.interrupted) { this.waiting.push({ res, ok: this._allowed() }); return; }
        if (!this._allowed()) { this.waiting.push({ res, ok: false }); return; }
        clock.task(8, () => {
          if (this.state === 'closed') return rej(new Error('InvalidStateError: closed'));
          if (P.interrupted) { this.waiting.push({ res, ok: true }); return; }
          this._to('running');
          res();
          this.waiting.splice(0).forEach(w => w.res());
        }, 'resume');
      });
    }
    suspend() { this._to('suspended'); return Promise.resolve(); }
    close() {
      if (this.state === 'closed') return Promise.reject(new Error('InvalidStateError: closed'));
      this._to('closed');
      return Promise.resolve();
    }

    decodeAudioData(buf, ok, err) {
      const fail = e => { if (typeof err === 'function') err(e); };
      let bytes = 0;
      try { bytes = buf.byteLength; structuredClone(buf, { transfer: [buf] }); } catch (e) { bytes = 0; }   // decoding detaches its input
      P.log('ctx.decode', { ctx: this.id, state: this.state, bytes });
      return new Promise((res, rej) => {
        if (!bytes) { clock.task(1, () => { const e = new Error('EncodingError: empty or detached buffer'); fail(e); rej(e); }, 'decode'); return; }
        if (P.faults.decodeHangs) return;
        if (P.faults.decodeHangsUnlessRunning && this.state !== 'running') return;
        clock.task(5, () => {
          if (this.state === 'closed' || P.faults.decodeFails) { const e = new Error('decode failed'); fail(e); rej(e); return; }
          const b = { duration: 0.18, length: 7938, sampleRate: 44100, numberOfChannels: 1, _ctx: this.id };
          if (typeof ok === 'function') ok(b);
          res(b);
        }, 'decode');
      }).catch(e => { if (typeof err !== 'function') throw e; });
    }
    createBuffer(ch, len, rate) {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { duration: len / rate, length: len, sampleRate: rate, numberOfChannels: ch, _ctx: this.id,
        getChannelData: i => data[i], copyToChannel: (src, i) => data[i].set(src) };
    }

    createGain() { const n = new Node_(this, 'gain'); n.gain = new Param(1); return n; }
    createBiquadFilter() { const n = new Node_(this, 'biquad'); n.type = 'lowpass'; n.frequency = new Param(350); return n; }
    createBufferSource() {
      const ctx = this;
      const n = new Node_(this, 'source');
      n.buffer = null; n.playbackRate = new Param(1);
      n.start = function (when = 0) {
        if (ctx.state === 'closed') throw new Error('InvalidStateError: closed');
        if (!Number.isFinite(when) || when < 0) throw new TypeError('start time must be a finite non-negative number');
        if (!n.buffer) return;
        let gain = 1, lp = null, reach = false, hop = n._out, i = 0;
        while (hop && i++ < 8) {
          if (hop.kind === 'gain') gain *= hop.gain.value;
          if (hop.kind === 'biquad') lp = hop.frequency.value;
          if (hop.kind === 'destination') { reach = hop.context === ctx; break; }
          hop = hop._out;
        }
        if (!reach) return;
        n._click = { when, rate: n.playbackRate.value, gain, lp, engine: lp ? 'rhythm' : 'met',
          main: !lp && n.playbackRate.value !== 1.08, schedV: clock.now, schedT: ctx.currentTime };
        ctx.pending.push(n._click);
        P.scheduled++;
      };
      n.stop = () => {                       // takes back a click that has not sounded yet
        if (ctx.state === 'closed') throw new Error('InvalidStateError: closed');
        ctx._collect();
        const i = ctx.pending.indexOf(n._click);
        if (i >= 0) ctx.pending.splice(i, 1);
      };
      return n;
    }

    getOutputTimestamp() {
      if (P.faults.staleOutputTs) return { contextTime: P.staleTs ?? 0.5, performanceTime: clock.now };
      return { contextTime: Math.max(0, this.currentTime - this.outputLatency), performanceTime: clock.now };
    }
  };
}

/* What a person (or iOS) can do to the app. Every action is a plain
   {kind, ...args} object so a run can be replayed and shrunk. */

function fire(env, el, type, act) {
  const { P, win, clock } = env;
  P.activation = act;
  try { el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true })); }
  catch (e) { clock.errors.push({ at: clock.now, where: 'event:' + type, error: e }); }
  finally { P.activation = false; }
}

export function editor(env) { return env.$('.bpm-input'); }

function closeEditor(env, how) {
  const { P, win } = env;
  const input = editor(env);
  if (!input) return false;
  if (how === 'enter' || how === 'escape')
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: how === 'enter' ? 'Enter' : 'Escape', bubbles: true, cancelable: true }));
  else input.dispatchEvent(new win.FocusEvent('blur'));
  if (P.kbInterrupt) { P.kbInterrupt = false; P.endInterrupt(P.kbEndMode || 'stuck'); }
  return true;
}

/* Only what is on screen can be touched: the active view, or the header and tabs. */
export function reachable(env, el) {
  if (!el || el === env.doc.body) return !!el;
  const view = el.closest('.view');
  if (!view) return true;
  if (!view.classList.contains('active')) return false;
  const ref = view.classList.contains('ref-mode');
  if (el.closest('.chord-practice') && ref) return false;
  if (el.closest('.chord-reference') && !ref) return false;
  return true;
}
export function visibleToggle(env) {
  return ['#met-toggle', '#chordmet-toggle', '#scalemet-toggle'].map(s => env.$(s)).find(el => reachable(env, el)) || null;
}

export function tap(env, target) {
  const { P, clock } = env;
  const el = typeof target === 'string' ? env.$(target) : target;
  if (!el || !reachable(env, el)) return false;
  const open = editor(env);
  if (open && open !== el && P.policy.tapBlurs) closeEditor(env, 'blur');
  P.lastTap = clock.now;
  const early = !P.policy.strictActivation;          // strict: a touch only counts once the finger lifts
  fire(env, el, 'pointerdown', early);
  fire(env, el, 'touchstart', early);
  fire(env, el, 'pointerup', true);
  fire(env, el, 'touchend', true);
  fire(env, el, 'click', true);
  return true;
}

const nth = (env, sel, i) => { const a = env.$$(sel); return a.length ? a[Math.abs(i) % a.length] : null; };

export const ACTIONS = {
  /* ---- the person ---- */
  tap: (env, a) => tap(env, a.sel),
  tapNth: (env, a) => tap(env, nth(env, a.sel, a.i)),
  doubleTap: (env, a) => { tap(env, a.sel); return tap(env, a.sel); },
  tapBody: env => tap(env, env.doc.body),
  wait: () => true,
  tapToggle: env => tap(env, visibleToggle(env)),
  doubleTapToggle: env => { const el = visibleToggle(env); tap(env, el); return tap(env, el); },
  bpmStep: (env, a) => {
    const sels = a.up ? ['#bpm-inc', '#chordmet-inc', '#scalemet-inc'] : ['#bpm-dec', '#chordmet-dec', '#scalemet-dec'];
    const el = sels.map(s => env.$(s)).find(e => reachable(env, e));
    let ok = false;
    for (let i = 0; i < (a.n || 1); i++) ok = tap(env, el);
    return ok;
  },
  slider: (env, a) => {
    const el = env.$('#bpm-range'); if (!el || !reachable(env, el)) return false;
    el.value = String(a.v);
    el.dispatchEvent(new env.win.Event('input', { bubbles: true }));
    return true;
  },
  editOpen: (env, a) => {
    if (editor(env)) return false;
    const el = a.sel ? nth(env, a.sel, a.i || 0) : env.$$('.js-bpm').find(e => reachable(env, e));
    if (!el || !tap(env, el)) return false;
    const input = editor(env);
    if (!input) return false;
    if (env.P.faults.kbInterrupts) { env.P.kbInterrupt = true; env.P.kbEndMode = a.end || 'stuck'; env.P.interrupt('keyboard'); }
    return true;
  },
  editType: (env, a) => { const input = editor(env); if (!input) return false; input.value = a.text; return true; },
  editClose: (env, a) => closeEditor(env, a.how || 'enter'),

  /* ---- the device ---- */
  hide: (env, a) => env.P.hide(a),
  show: (env, a) => env.P.show(a),
  interrupt: env => env.P.interrupt(),
  endInterrupt: (env, a) => env.P.endInterrupt(a.mode),
  wedge: env => env.P.wedge(),
  suspendAll: env => env.P.suspendAll(),
  clockJump: (env, a) => env.P.clockJump(a.sec),
  stall: (env, a) => env.P.stall(a.ms),
  fault: (env, a) => env.P.setFault(a.name, a.on !== false),
  staleTs: (env, a) => { env.P.staleTs = a.value; env.P.setFault('staleOutputTs', true); },
};

export const DEVICE = new Set(['hide', 'show', 'interrupt', 'endInterrupt', 'wedge', 'suspendAll', 'clockJump', 'stall', 'fault', 'staleTs', 'wait']);

export function act(env, a) {
  const f = ACTIONS[a.kind];
  if (!f) throw new Error('unknown action ' + a.kind);
  return f(env, a);
}

/* shorthands used by the scripted scenarios */
export const SEL = {
  toggle: '#met-toggle', chordToggle: '#chordmet-toggle', scaleToggle: '#scalemet-toggle', rhythm: '#rhythm-toggle',
  inc: '#bpm-inc', dec: '#bpm-dec', tapTempo: '#tap-tempo', gear: '#gear-btn',
  tab: t => `.tabs button[data-tab="${t}"]`,
  cmode: m => `#chord-mode button[data-cmode="${m}"]`,
};

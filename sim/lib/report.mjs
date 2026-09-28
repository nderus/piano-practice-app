/* Turns a failed run into something a person can read and replay. */

const fmt = a => {
  const { dt, kind, ...rest } = a;
  const args = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `+${String(dt).padStart(6)} ms  ${kind}${args}`;
};

export function stateDump(env) {
  const s = env.peek();
  const { audioCtx, ...plain } = s;
  return {
    app: plain,
    toggle: env.$('#met-toggle')?.textContent.trim(),
    currentContext: audioCtx ? audioCtx.id : null,
    contexts: env.P.contexts.map(c => ({ id: c.id, state: c.state, wedged: c.wedged, time: +c.currentTime.toFixed(3), waiting: c.pending.length })),
    device: { visible: env.P.visible, interrupted: env.P.interrupted, timers: env.clock.mode, faults: Object.keys(env.P.faults).filter(k => env.P.faults[k]), policy: env.P.policy },
    heard: env.P.heard.length,
    alerts: env.P.alerts,
  };
}

export function describe(result, { steps, title }) {
  const out = [];
  out.push(`FAIL ${title}`);
  out.push(`  invariant ${result.fail.id} at ${(result.fail.at / 1000).toFixed(2)} s: ${result.fail.msg}`);
  out.push('  steps:');
  for (const a of steps) out.push('    ' + fmt(a));
  out.push('  state: ' + JSON.stringify(result.dump, null, 2).split('\n').join('\n  '));
  out.push('  last device events:');
  for (const e of result.events.slice(-18)) { const { t, ev, ...d } = e; out.push(`    ${String(t).padStart(7)} ms  ${ev} ${JSON.stringify(d)}`); }
  return out.join('\n');
}

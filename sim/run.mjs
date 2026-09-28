#!/usr/bin/env node
/* Metronome simulation harness. See README.md.

   node run.mjs --smoke                       does the harness itself work?
   node run.mjs --matrix                      every scripted scenario, working tree
   node run.mjs --matrix --compare 1debc9b,fixtures/v32-draft.html,tree
   node run.mjs --scenario lock-wedged        one scenario, with full trace on failure
   node run.mjs --runs 500 --steps 60         random runs (default when nothing else is asked)
   node run.mjs --seed 1234                   replay one random run
   add --rev REV or --file PATH to test something other than the working tree */

import { existsSync } from 'node:fs';
import { loadSource, versions } from './lib/source.mjs';
import { boot } from './lib/env.mjs';
import { Oracles } from './lib/oracles.mjs';
import { SCENARIOS } from './lib/scenarios.mjs';
import { generate } from './lib/fuzz.mjs';
import { shrink } from './lib/shrink.mjs';
import { describe, stateDump } from './lib/report.mjs';

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

let rejections = [];
process.on('unhandledRejection', e => { rejections.push(e); });

const sourceFor = spec => {
  if (!spec || spec === 'tree') return loadSource({});
  if (existsSync(spec)) return loadSource({ file: spec });
  return loadSource({ rev: spec });
};

async function runOne(src, { steps, policy, storage, seed = 1 }) {
  rejections = [];
  const env = boot(src, { seed, policy, storage });
  const orc = new Oracles(env);
  orc.sample();
  for (const a of steps) { if (orc.fail) break; await orc.step(a); }
  await orc.finish();
  if (!orc.fail && flag('strict') && rejections.length) orc.bad('vii', 'unhandled rejection: ' + String(rejections[0] && rejections[0].message || rejections[0]));
  const result = { fail: orc.fail, checked: orc.checked, dump: stateDump(env), events: env.P.events.slice(-40),
    heard: env.P.heard.length, rejections: rejections.length, vtime: env.clock.now };
  env.close();
  return result;
}

function staticChecks(src) {
  const v = versions(src), bad = [];
  if (!v.app || !v.cache) bad.push('could not read versions');
  else if (v.app !== v.cache) bad.push(`viii: APP_VERSION ${v.app} does not match cache ${v.cache}`);
  if (v.shipsSim) bad.push('sw.js ASSETS lists sim/ files');
  return { v, bad };
}

async function smoke(src) {
  const env = boot(src, {});
  const orc = new Oracles(env);
  const ok = [];
  const need = (c, what) => { ok.push([!!c, what]); };
  need(env.errors.length === 0, 'page script ran without exceptions');
  need(env.peek().metRunning === false, 'app internals are readable (metRunning)');
  need(typeof env.peek().bpm === 'number', 'state.bpm is readable');
  await orc.step({ dt: 100, kind: 'tapToggle' });
  await orc.advance(3000);
  need(env.peek().metRunning === true, 'a tap on Start starts the metronome');
  const heard = env.P.collect().filter(c => c.engine === 'met');
  need(heard.length >= 2, `clicks are heard (${heard.length} in 3 s)`);
  const gap = heard.length >= 2 ? heard[1].vtime - heard[0].vtime : NaN;
  need(Math.abs(gap - 60000 / env.peek().bpm) < 2, `spacing matches the tempo (${gap.toFixed(1)} ms at ${env.peek().bpm} bpm)`);
  need(/rotate\(/.test(env.$('.js-pend-arm').style.transform), 'pendulum transform is observable');
  need(env.clock.liveIntervals('scheduler') === 1, 'scheduler interval is visible by name');
  env.close();
  for (const [c, what] of ok) console.log((c ? '  ok    ' : '  FAIL  ') + what);
  return ok.every(([c]) => c);
}

async function matrix(specs) {
  const srcs = specs.map(sourceFor);
  const names = flag('scenario') ? [opt('scenario')] : SCENARIOS.map(s => s.name);
  const rows = [], details = [];
  for (const name of names) {
    const sc = SCENARIOS.find(s => s.name === name);
    if (!sc) { console.error('no scenario named ' + name); process.exit(2); }
    const row = [name];
    for (const src of srcs) {
      const r = await runOne(src, sc);
      row.push(r.fail ? 'FAIL ' + r.fail.id : 'pass');
      if (r.fail) details.push({ src, sc, r });
    }
    rows.push(row);
  }
  const head = ['scenario', ...srcs.map(s => s.label)];
  const wd = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const line = r => r.map((c, i) => c.padEnd(wd[i])).join('  ');
  console.log(line(head)); console.log(wd.map(n => '-'.repeat(n)).join('  '));
  rows.forEach(r => console.log(line(r)));
  console.log('');
  for (const src of srcs) {
    const st = staticChecks(src);
    console.log(`${src.label}: build ${st.v.app}, cache ${st.v.cache}` + (st.bad.length ? '  <- ' + st.bad.join('; ') : ''));
  }
  if (details.length && (flag('verbose') || names.length === 1 || srcs.length === 1)) {
    console.log('');
    for (const d of details) {
      console.log(describe(d.r, { steps: d.sc.steps, title: `${d.sc.name} on ${d.src.label} (${d.sc.about})` }));
      console.log('');
    }
  } else if (details.length) {
    console.log('');
    for (const d of details) console.log(`${d.sc.name} on ${d.src.label}: ${d.r.fail.id} at ${(d.r.fail.at / 1000).toFixed(1)} s, ${d.r.fail.msg}`);
  }
  return details.length;
}

async function fuzz(src) {
  const n = +opt('steps', 60);
  const seeds = flag('seed') ? [+opt('seed')] : Array.from({ length: +opt('runs', 100) }, (_, i) => +opt('from', 1) + i);
  let failed = 0, checkedI = 0, checkedII = 0, vtime = 0;
  const t0 = Date.now(), byId = {};
  for (const seed of seeds) {
    const g = generate(seed, n);
    const r = await runOne(src, g);
    checkedI += r.checked.i; checkedII += r.checked.ii; vtime += r.vtime;
    if (!r.fail) continue;
    failed++;
    byId[r.fail.id] = (byId[r.fail.id] || 0) + 1;
    if (failed > +opt('show', 3)) { console.log(`FAIL seed ${seed}: ${r.fail.id} ${r.fail.msg}`); continue; }
    let steps = g.steps, shown = r;
    if (!flag('no-shrink')) {
      const s = await shrink(st => runOne(src, { ...g, steps: st }), g.steps, r.fail.id);
      steps = s.steps; shown = await runOne(src, { ...g, steps });
      if (!shown.fail) { steps = g.steps; shown = r; }
    }
    console.log(describe(shown, { steps, title: `seed ${seed} on ${src.label} (${g.steps.length} steps, shrunk to ${steps.length})` }));
    console.log(`  replay: node run.mjs --seed ${seed} --steps ${n}` + (src.label === 'working tree' ? '' : ' --rev/--file ...') + '\n');
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${src.label}: ${seeds.length} runs, ${failed} failed` + (failed ? ' ' + JSON.stringify(byId) : '')
    + `; ${Math.round(vtime / 60000)} simulated minutes in ${secs} s; liveness judged ${checkedI} times, restart judged ${checkedII} times`);
  return failed;
}

const src = sourceFor(opt('rev') || opt('file'));
let bad = 0;
if (flag('smoke')) bad = (await smoke(src)) ? 0 : 1;
else if (flag('matrix') || flag('scenario')) bad = await matrix(flag('compare') ? opt('compare').split(',') : [opt('rev') || opt('file') || 'tree']);
else bad = await fuzz(src);
process.exit(bad ? 1 : 0);

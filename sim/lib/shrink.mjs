/* Delta debugging over a failing step list: keep deleting chunks for as long
   as the same invariant still fails. */

export async function shrink(run, steps, failId, { budget = 150 } = {}) {
  let cur = steps.slice(), n = 2, used = 0;
  const still = async cand => { used++; const r = await run(cand); return !!(r.fail && r.fail.id === failId); };
  while (cur.length >= 2 && used < budget) {
    const size = Math.ceil(cur.length / n);
    let cut = false;
    for (let i = 0; i < cur.length && used < budget; i += size) {
      const cand = cur.slice(0, i).concat(cur.slice(i + size));
      if (cand.length && await still(cand)) { cur = cand; n = Math.max(n - 1, 2); cut = true; break; }
    }
    if (!cut) { if (size <= 1) break; n = Math.min(cur.length, n * 2); }
  }
  return { steps: cur, replays: used };
}

/* Where the app under test comes from: the working tree, a git revision, or a file. */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (args, enc) => execFileSync('git', args, { cwd: ROOT, encoding: enc, maxBuffer: 64 * 1024 * 1024 });

export function loadSource({ rev, file } = {}) {
  if (rev) {
    return {
      label: rev,
      html: git(['show', rev + ':index.html'], 'utf8'),
      sw: git(['show', rev + ':sw.js'], 'utf8'),
      wav: new Uint8Array(git(['show', rev + ':click.wav'], 'buffer')),
    };
  }
  const wav = new Uint8Array(readFileSync(resolve(ROOT, 'click.wav')));
  if (file) {
    const p = resolve(process.cwd(), file);
    const swGuess = p.replace(/\.html$/, '-sw.js');
    return {
      label: basename(p),
      html: readFileSync(p, 'utf8'),
      sw: readFileSync(existsSync(swGuess) ? swGuess : resolve(ROOT, 'sw.js'), 'utf8'),
      wav,
    };
  }
  return {
    label: 'working tree',
    html: readFileSync(resolve(ROOT, 'index.html'), 'utf8'),
    sw: readFileSync(resolve(ROOT, 'sw.js'), 'utf8'),
    wav,
  };
}

/* versions as the files declare them, without running anything */
export function versions(src) {
  const app = /APP_VERSION\s*=\s*'([^']+)'/.exec(src.html);
  const cache = /CACHE\s*=\s*'piano-practice-([^']+)'/.exec(src.sw);
  const assets = /ASSETS\s*=\s*\[([\s\S]*?)\]/.exec(src.sw);
  return { app: app && app[1], cache: cache && cache[1], shipsSim: !!(assets && /sim\//.test(assets[1])) };
}

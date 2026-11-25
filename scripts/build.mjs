// Build the site into dist/: index.html at the root, everything else hashed under assets/.
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const dev = process.argv.includes('--dev');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.js', 'src/style.css'],
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2020'],
  outdir: 'dist/assets',
  entryNames: '[name]-[hash]',
  chunkNames: 'chunk-[hash]',
  assetNames: '[name]-[hash]',
  publicPath: '/assets',
  loader: { '.png': 'file', '.jpg': 'file', '.woff2': 'file', '.json': 'json' },
  minify: !dev,
  sourcemap: false,
  metafile: true,
  legalComments: 'none',
  logLevel: 'info',
});

const outs = Object.entries(result.metafile.outputs);
const find = (test) => {
  const hit = outs.find(([file, o]) => test(file, o));
  if (!hit) throw new Error('build output missing');
  return 'assets/' + path.basename(hit[0]);
};
const js = find((f, o) => o.entryPoint === 'src/main.js');
const css = find((f, o) => f.endsWith('.css'));
const font = (name) => '/' + find((f) => path.basename(f).startsWith(name) && f.endsWith('.woff2'));

// tell the browser about the 3D code and terrain up front, so they download alongside the page
const hints = outs
  .filter(([f, o]) => f.endsWith('.js') && o.entryPoint !== 'src/main.js')
  .map(([f]) => `<link rel="modulepreload" href="/assets/${path.basename(f)}">`)
  .concat(['height', 'water'].map((n) => `<link rel="preload" as="fetch" crossorigin href="/${find((f) => path.basename(f).startsWith(n + '-') && f.endsWith('.png'))}">`))
  .join('\n');

const page = (name, extras = {}) => {
  let html = extras.html;
  return html
    .replaceAll('%JS%', extras.js || '')
    .replaceAll('%CSS%', css)
    .replaceAll('%HINTS%', extras.hints || '')
    .replaceAll('%FONT_SERIF_ITALIC%', font('newsreader-latin-opsz-italic'))
    .replaceAll('%FONT_SERIF%', font('newsreader-latin-wght-normal'))
    .replaceAll('%FONT_SANS%', font('hanken-grotesk-latin-wght-normal'));
};
const indexHtml = await readFile(path.join(root, 'src/index.html'), 'utf8');
await writeFile(path.join(dist, 'index.html'), page('index.html', { html: indexHtml, js, hints }));
const privacyHtml = await readFile(path.join(root, 'src/privacy.html'), 'utf8');
await writeFile(path.join(dist, 'privacy.html'), page('privacy.html', { html: privacyHtml }));
await cp(path.join(root, 'public'), dist, { recursive: true });

let total = 0;
for (const [file, o] of outs) { total += o.bytes; }
console.log(`\nbuilt ${outs.length} files, ${(total / 1024).toFixed(0)} KB before compression`);

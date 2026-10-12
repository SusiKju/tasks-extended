// TE-75: Setzt Commit-SHA und Precache-Liste in dist/sw.js ein (aufgerufen von deploy.yml).
// Usage: node scripts/build-sw.mjs <sha>
import fs from 'fs';

const sha = process.argv[2];
if (!sha) throw new Error('SHA fehlt');

const SKIP = new Set(['sw.js', 'index.html', '404.html', 'version.json', 'metadata.json']);
const files = fs.readdirSync('dist', { recursive: true })
  .map((f) => f.split('\\').join('/'))
  .filter((f) => !SKIP.has(f) && !f.startsWith('kinder/') && !f.split('/').some((x) => x.startsWith('.')) && fs.statSync(`dist/${f}`).isFile())
  .map((f) => encodeURI(`/tasks-extended/${f}`));

const sw = fs.readFileSync('dist/sw.js', 'utf8')
  .replace('__SHA__', sha)
  .replace('__PRECACHE__', JSON.stringify(files));
fs.writeFileSync('dist/sw.js', sw);
console.log(`sw.js: ${files.length} Dateien im Precache`);

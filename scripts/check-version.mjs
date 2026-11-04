// Prüft die Versionsregel aus CLAUDE.md:
//  1. package.json "version" und app.json "expo.version" sind identisch.
//  2. Mit Basis-Ref (z. B. `node scripts/check-version.mjs origin/main`) muss die
//     Version gegenüber der Basis hochgesetzt sein.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo.version;
let failed = false;

if (pkg !== app) {
  console.error(`✗ Version uneinheitlich: package.json=${pkg}, app.json=${app}`);
  failed = true;
} else {
  console.log(`✓ package.json und app.json stehen beide auf ${pkg}`);
}

const baseRef = process.argv[2];
if (baseRef) {
  const base = JSON.parse(execFileSync('git', ['show', `${baseRef}:package.json`], { encoding: 'utf8' })).version;
  const parse = (v) => v.split('.').map(Number);
  const [a, b] = [parse(pkg), parse(base)];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (cmp <= 0) {
    console.error(`✗ Version nicht hochgesetzt: ${baseRef} hat ${base}, dieser Stand ${pkg}. Siehe CLAUDE.md (PATCH/MINOR/MAJOR).`);
    failed = true;
  } else {
    console.log(`✓ Version hochgesetzt: ${base} → ${pkg}`);
  }
}

process.exit(failed ? 1 : 0);

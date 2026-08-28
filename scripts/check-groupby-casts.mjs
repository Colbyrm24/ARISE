#!/usr/bin/env node
/*
  Forbids `prisma.x.groupBy({...}) as Promise<T>`.

  That form compiles against the offline stub — which types groupBy as
  `(args: any) => Promise<any[]>` — and does NOT compile against real Prisma.
  Casting the call expression feeds the expected type back into groupBy's
  generic inference, which then demands the argument be an array as well.
  It passed every local check and failed the Vercel build.

  Write `as unknown as Promise<T>`, or await first and cast the value.
*/
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx"', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const bad = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // `}) as Promise<` closing a groupBy call, without going through unknown.
    // Skip comment lines so the note explaining this rule doesn't trip it.
    const code = line.trim();
    if (code.startsWith('*') || code.startsWith('//')) return;
    if (/\}\)\s*as\s+Promise</.test(line) && !/as\s+unknown\s+as/.test(line)) {
      bad.push(`${f}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (bad.length) {
  console.error('Casting a Prisma call expression to Promise<T> does not compile on Vercel.');
  console.error('Use `as unknown as Promise<T>`, or await first and cast the value.\n');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}

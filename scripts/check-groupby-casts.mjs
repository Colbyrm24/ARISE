#!/usr/bin/env node
/*
  Forbids `prisma.x.groupBy({...}) as Promise<T>`.

  That form compiles against the offline stub — which types groupBy as
  `(args: any) => Promise<any[]>` — and does NOT compile against real Prisma.
  Casting the call expression feeds the expected type back into groupBy's
  generic inference, which then demands the argument be an array as well.
  It passed every local check and failed the Vercel build.

  Write `as unknown as T`. Awaiting first does NOT avoid it — the expected
  type still flows back through the await.
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
    // `}) as Promise<T>` and `})) as T[]` both feed the expected type back
    // into groupBy's generics. Awaiting first does not help.
    const casts = /\}\)+\s*as\s+(?!unknown\b)/.test(line);
    if (casts) {
      bad.push(`${f}:${i + 1}  ${line.trim()}`);
    }
  });
}

if (bad.length) {
  console.error('Casting a Prisma call expression to Promise<T> does not compile on Vercel.');
  console.error('Use `as unknown as T`. Awaiting first does not avoid it.\n');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}

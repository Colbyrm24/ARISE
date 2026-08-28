import { readFileSync } from 'node:fs';

/*
  Prisma has no block comments.

  `/* … *\/` is valid in every other file in this repo, so it goes into
  schema.prisma by reflex — and the schema language accepts only `//` and
  `///`. The result is "This line is not a valid field or attribute
  definition" pointing at the prose, and it does not surface until a build
  runs `prisma generate`.

  Nothing local catches it otherwise: `prisma validate` needs the CLI's
  engine binaries, which are not always fetchable, and the offline stub
  generator this repo uses is a brace scanner that reads straight past the
  comment. So the check is a regex, and it costs nothing.
*/

const path = 'prisma/schema.prisma';
const src = readFileSync(path, 'utf8');

const offenders = [];
src.split('\n').forEach((line, i) => {
  // Only the opener needs finding; the closer is on one of the lines after.
  if (line.includes('/*')) offenders.push({ line: i + 1, text: line.trim() });
});

if (offenders.length > 0) {
  console.error(`\n${path}: block comments are not valid Prisma syntax.\n`);
  for (const o of offenders) {
    console.error(`  ${path}:${o.line}  ${o.text}`);
  }
  console.error('\nUse // or /// instead. Prisma only accepts line comments.\n');
  process.exit(1);
}

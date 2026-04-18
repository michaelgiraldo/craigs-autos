import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const forbiddenCopiedClientStrings = [
  'ABC Upholstery',
  'abc-upholstery',
  'Stevens Creek',
  '2221 Stevens',
  '(408) 241-6800',
  '4082416800',
  '+14082416800',
  'cesar.autos',
  'leads@cesar',
  'website@cesar',
];

const allowedFiles = new Set([
  'docs/abc-parity-audit-2026-04-14.md',
  'scripts/validate-business-profile-usage.mjs',
]);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !allowedFiles.has(file))
  .filter((file) => !file.startsWith('dist/'))
  .filter((file) => !file.startsWith('node_modules/'));

const findings = [];

for (const file of files) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const value of forbiddenCopiedClientStrings) {
    const index = text.toLowerCase().indexOf(value.toLowerCase());
    if (index === -1) continue;
    const line = text.slice(0, index).split('\n').length;
    findings.push(`${file}:${line} contains copied client value "${value}"`);
  }
}

if (findings.length) {
  console.error('Business profile usage validation failed.');
  console.error(
    'Move business facts into shared/business-profile.js or use neutral test fixtures.',
  );
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('Business profile usage validation passed.');

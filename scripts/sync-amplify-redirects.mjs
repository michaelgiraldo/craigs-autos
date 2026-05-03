import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config/redirects.json');
const VALID_STATUSES = new Set(['200', '301', '302', '404', '404-200']);

const args = new Set(process.argv.slice(2));
const shouldCheck = args.has('--check');
const dryRun = args.has('--dry-run');

const config = readConfig(CONFIG_PATH);
const appId = process.env.AWS_APP_ID || config.appId;
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || config.region;
const rules = normalizeRules(config.rules);

validateConfig({ appId, region, rules });

if (dryRun) {
  console.log(JSON.stringify({ appId, region, customRules: rules }, null, 2));
  process.exit(0);
}

if (shouldCheck) {
  const liveRules = getLiveRules({ appId, region });
  if (!rulesMatch(rules, liveRules)) {
    console.error('Amplify redirect rules are out of sync with config/redirects.json.');
    console.error('Expected:');
    console.error(JSON.stringify(rules, null, 2));
    console.error('Live:');
    console.error(JSON.stringify(liveRules, null, 2));
    process.exit(1);
  }

  console.log('Amplify redirect rules match config/redirects.json.');
  process.exit(0);
}

syncRules({ appId, region, rules });
console.log(`Synced ${rules.length} Amplify redirect rules for app ${appId}.`);

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Unable to read ${path.relative(ROOT, configPath)}: ${error.message}`);
  }
}

function normalizeRules(rawRules) {
  if (!Array.isArray(rawRules)) {
    throw new Error('config/redirects.json must contain a rules array.');
  }

  return rawRules
    .map((rule) => ({
      source: String(rule.source ?? '').trim(),
      target: String(rule.target ?? '').trim(),
      status: String(rule.status ?? '').trim(),
      condition: rule.condition == null ? undefined : String(rule.condition).trim(),
    }))
    .map((rule) => {
      if (rule.condition === undefined) {
        delete rule.condition;
      }
      return rule;
    });
}

function validateConfig({ appId, region, rules }) {
  const errors = [];

  if (!appId) errors.push('Missing appId. Set appId in config/redirects.json or AWS_APP_ID.');
  if (!region) errors.push('Missing region. Set region in config/redirects.json or AWS_REGION.');

  const seenSources = new Set();
  for (const [index, rule] of rules.entries()) {
    const label = `rules[${index}]`;

    if (!isValidSource(rule.source)) {
      errors.push(
        `${label}.source must be a path starting with "/" or a host-only absolute URL such as "https://www.craigs.autos".`,
      );
    }
    if (!rule.target) {
      errors.push(`${label}.target is required.`);
    }
    if (!VALID_STATUSES.has(rule.status)) {
      errors.push(`${label}.status must be one of ${[...VALID_STATUSES].join(', ')}.`);
    }
    if (seenSources.has(rule.source)) {
      errors.push(`Duplicate redirect source: ${rule.source}`);
    }

    seenSources.add(rule.source);
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

function isValidSource(source) {
  if (source.startsWith('/')) {
    return true;
  }

  try {
    const parsed = new URL(source);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname.length > 0 &&
      (parsed.pathname === '' || parsed.pathname === '/') &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

function getLiveRules({ appId, region }) {
  const result = runAws([
    'amplify',
    'get-app',
    '--app-id',
    appId,
    '--region',
    region,
    '--query',
    'app.customRules',
    '--output',
    'json',
  ]);

  return normalizeRules(JSON.parse(result.stdout || '[]'));
}

function syncRules({ appId, region, rules }) {
  runAws([
    'amplify',
    'update-app',
    '--app-id',
    appId,
    '--region',
    region,
    '--custom-rules',
    JSON.stringify(rules),
    '--output',
    'json',
  ]);
}

function runAws(args) {
  const result = spawnSync('aws', args, {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'unknown AWS CLI failure';
    throw new Error(detail);
  }

  return result;
}

function rulesMatch(expected, actual) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

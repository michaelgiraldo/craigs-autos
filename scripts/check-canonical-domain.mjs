import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config/amplify-domain.json');

const args = new Set(process.argv.slice(2));
const localOnly = args.has('--local');
const withHttp = args.has('--http');

const config = readConfig(CONFIG_PATH);
validateLocalConfig(config);

if (localOnly) {
  console.log('Canonical domain config is valid.');
  process.exit(0);
}

const domainAssociation = getDomainAssociation(config);
const route53Records = getRoute53Records(config);
const failures = [
  ...checkAmplifySubdomains(config, domainAssociation),
  ...checkRoute53Records(config, route53Records),
];

if (withHttp) {
  failures.push(...(await checkPublicHttp(config)));
}

if (failures.length > 0) {
  console.error('Canonical domain check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Canonical domain live state matches config/amplify-domain.json.');

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Unable to read ${path.relative(ROOT, configPath)}: ${error.message}`);
  }
}

function validateLocalConfig(rawConfig) {
  const errors = [];
  for (const key of ['appId', 'region', 'domainName', 'hostedZoneId', 'branchName', 'canonicalHost']) {
    if (!rawConfig[key] || typeof rawConfig[key] !== 'string') {
      errors.push(`${key} must be a non-empty string.`);
    }
  }
  for (const key of ['redirectHosts', 'retiredHosts', 'forbiddenSubdomainPrefixes']) {
    if (!Array.isArray(rawConfig[key])) {
      errors.push(`${key} must be an array.`);
    }
  }
  if (rawConfig.canonicalHost !== rawConfig.domainName) {
    errors.push('canonicalHost must match domainName for this apex-only site.');
  }
  for (const host of rawConfig.redirectHosts ?? []) {
    if (host === rawConfig.canonicalHost) {
      errors.push('redirectHosts must not include the canonical host.');
    }
    if (!host.endsWith(`.${rawConfig.domainName}`)) {
      errors.push(`redirect host ${host} is outside ${rawConfig.domainName}.`);
    }
  }
  for (const host of rawConfig.retiredHosts ?? []) {
    if (!host.endsWith(`.${rawConfig.domainName}`)) {
      errors.push(`retired host ${host} is outside ${rawConfig.domainName}.`);
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
}

function getDomainAssociation({ appId, domainName, region }) {
  const result = runAws([
    'amplify',
    'get-domain-association',
    '--app-id',
    appId,
    '--domain-name',
    domainName,
    '--region',
    region,
    '--output',
    'json',
  ]);
  return JSON.parse(result.stdout).domainAssociation;
}

function getRoute53Records({ hostedZoneId }) {
  const result = runAws([
    'route53',
    'list-resource-record-sets',
    '--hosted-zone-id',
    hostedZoneId,
    '--output',
    'json',
  ]);
  return JSON.parse(result.stdout).ResourceRecordSets ?? [];
}

function checkAmplifySubdomains(config, domainAssociation) {
  const failures = [];
  const expected = new Map([
    ['', config.branchName],
    ...config.redirectHosts.map((host) => [hostToPrefix(config, host), config.branchName]),
  ]);
  const actual = new Map();
  for (const subDomain of domainAssociation.subDomains ?? []) {
    const setting = subDomain.subDomainSetting ?? {};
    const prefix = setting.prefix ?? '';
    actual.set(prefix, setting.branchName ?? '');
  }

  for (const forbidden of config.forbiddenSubdomainPrefixes) {
    if (actual.has(forbidden)) {
      failures.push(`Amplify domain association still includes forbidden subdomain prefix "${forbidden}".`);
    }
  }
  for (const [prefix, branchName] of expected.entries()) {
    if (actual.get(prefix) !== branchName) {
      const label = prefix || '(apex)';
      failures.push(`Amplify domain association missing ${label} -> ${branchName}.`);
    }
  }
  for (const prefix of actual.keys()) {
    if (!expected.has(prefix)) {
      failures.push(`Amplify domain association has unexpected subdomain prefix "${prefix || '(apex)'}".`);
    }
  }
  return failures;
}

function checkRoute53Records(config, records) {
  const failures = [];
  const recordNames = new Set(records.map((record) => record.Name));
  const wildcardName = `\\052.${config.domainName}.`;
  if (recordNames.has(wildcardName)) {
    failures.push(`Route 53 still contains wildcard record ${wildcardName}`);
  }
  for (const host of config.redirectHosts) {
    const recordName = `${host}.`;
    if (!recordNames.has(recordName)) {
      failures.push(`Route 53 is missing explicit redirect host record ${recordName}`);
    }
  }
  return failures;
}

async function checkPublicHttp(config) {
  const failures = [];
  const path = '/en/contact/';
  const canonical = await fetchHead(`https://${config.canonicalHost}${path}`);
  if (canonical.status !== 200) {
    failures.push(`Expected canonical host to serve ${path} with 200; got ${canonical.status}.`);
  }

  for (const host of config.redirectHosts) {
    const response = await fetchHead(`https://${host}${path}`);
    const location = response.headers.location ?? '';
    const expectedLocation = `https://${config.canonicalHost}${path}`;
    if (![301, 302].includes(response.status) || location !== expectedLocation) {
      failures.push(
        `Expected ${host}${path} to redirect to ${expectedLocation}; got ${response.status} ${location || '(no location)'}.`,
      );
    }
  }

  for (const host of [...config.retiredHosts, `random-canonical-check.${config.domainName}`]) {
    const response = await fetchHead(`https://${host}${path}`).catch((error) => ({
      error: error.message,
      status: null,
      headers: {},
    }));
    if (response.status === 200) {
      failures.push(`Retired/unconfigured host ${host} still serves ${path} with 200.`);
    }
  }
  return failures;
}

function hostToPrefix(config, host) {
  return host.slice(0, -1 * (`.${config.domainName}`).length);
}

function fetchHead(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: 'HEAD', timeout: 10000 }, (response) => {
      response.resume();
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers });
      });
    });
    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error(`Timed out checking ${url}`));
    });
    request.end();
  });
}

function runAws(awsArgs) {
  const result = spawnSync('aws', awsArgs, {
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

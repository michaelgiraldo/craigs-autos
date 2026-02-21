import fs from 'node:fs';
import path from 'node:path';

const MAX_BATCH_SIZE = 10000;
const INDEXNOW_REQUEST_TIMEOUT_MS = 10_000;
const distDir = path.resolve('dist');
const sitemapIndexPath = path.join(distDir, 'sitemap-index.xml');
const branch = process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || process.env.BRANCH;

if (branch && branch !== 'main') {
  console.log(`IndexNow: skipping on branch ${branch}.`);
  process.exit(0);
}

if (!fs.existsSync(sitemapIndexPath)) {
  console.log('IndexNow: no sitemap-index.xml found, skipping.');
  process.exit(0);
}

const sitemapIndex = fs.readFileSync(sitemapIndexPath, 'utf-8');
const sitemapLocs = extractLocs(sitemapIndex).filter((loc) => loc.endsWith('.xml'));

if (sitemapLocs.length === 0) {
  console.log('IndexNow: no sitemap entries found, skipping.');
  process.exit(0);
}

const sitemapPaths = sitemapLocs.map((loc) => {
  try {
    return new URL(loc).pathname.replace(/^\//, '');
  } catch {
    return loc.replace(/^\//, '');
  }
});

const urls = [];
for (const sitemapPath of sitemapPaths) {
  const fullPath = path.join(distDir, sitemapPath);
  if (!fs.existsSync(fullPath)) {
    continue;
  }
  const xml = fs.readFileSync(fullPath, 'utf-8');
  urls.push(...extractLocs(xml));
}

const uniqueUrls = [...new Set(urls)];
if (uniqueUrls.length === 0) {
  console.log('IndexNow: no URLs found in sitemap, skipping.');
  process.exit(0);
}

const key = resolveIndexNowKey();
if (!key) {
  console.log('IndexNow: no key found, skipping.');
  process.exit(0);
}

const host = new URL(uniqueUrls[0]).host;
const keyLocation = `https://${host}/${key}.txt`;
const filteredUrls = uniqueUrls.filter((url) => safeHostMatch(url, host));

if (filteredUrls.length === 0) {
  console.log('IndexNow: no URLs match host, skipping.');
  process.exit(0);
}

await submitInBatches({
  host,
  key,
  keyLocation,
  urls: filteredUrls,
});

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  for (;;) {
    const match = re.exec(xml);
    if (match === null) break;
    const value = match[1]?.trim();
    if (value) {
      locs.push(value);
    }
  }
  return locs;
}

function resolveIndexNowKey() {
  if (process.env.INDEXNOW_KEY) {
    return process.env.INDEXNOW_KEY.trim();
  }

  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    return null;
  }

  const candidates = fs.readdirSync(publicDir).filter((name) => /^[a-f0-9]{32}\.txt$/i.test(name));

  if (candidates.length === 0) {
    return null;
  }

  const filename = candidates[0];
  const value = fs.readFileSync(path.join(publicDir, filename), 'utf-8').trim();
  return value || filename.replace(/\.txt$/i, '');
}

function safeHostMatch(url, host) {
  try {
    return new URL(url).host === host;
  } catch {
    return false;
  }
}

async function submitInBatches({ host, key, keyLocation, urls }) {
  for (let i = 0; i < urls.length; i += MAX_BATCH_SIZE) {
    const batch = urls.slice(i, i + MAX_BATCH_SIZE);
    const payload = {
      host,
      key,
      keyLocation,
      urlList: batch,
    };

    try {
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(INDEXNOW_REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        console.warn(`IndexNow: submission failed (${res.status}).`);
      } else {
        console.log(`IndexNow: submitted ${batch.length} URLs.`);
      }
    } catch (error) {
      console.warn(`IndexNow: request failed (${error?.message ?? 'unknown error'}).`);
    }
  }
}

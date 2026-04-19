import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ADMIN_HTML = path.join(ROOT, 'dist/admin/leads/index.html');

const forbiddenFragments = [
  { label: 'ChatKit island', pattern: /ChatWidgetReact|openai-chatkit|chat-widget/u },
  { label: 'sticky customer CTA', pattern: /sticky-cta/u },
  { label: 'public site header', pattern: /site-header/u },
  { label: 'public site footer', pattern: /site-footer/u },
  { label: 'public nav menu', pattern: /site-menu__|data-site-menu|site-nav/u },
  { label: 'public language switcher', pattern: /lang-switcher/u },
  { label: 'public lead tracking bootstrap', pattern: /initLeadInteractions|lead-interactions/u },
  { label: 'Google Tag Manager', pattern: /googletagmanager\.com|GTM-/u },
  { label: 'customer call link', pattern: /href="tel:/u },
  { label: 'customer text link', pattern: /href="sms:/u },
  { label: 'customer email link', pattern: /mailto:contact@craigs\.autos/u },
];

const requiredFragments = [
  { label: 'admin app root', pattern: /id="admin-leads-app"/u },
  { label: 'noindex robots tag', pattern: /<meta name="robots" content="noindex, nofollow"/u },
  { label: 'admin shell class', pattern: /class="admin-shell"/u },
  { label: 'lead qualification heading', pattern: /Lead Qualification/u },
];

const errors = [];

if (!fs.existsSync(ADMIN_HTML)) {
  errors.push(`Admin build output missing: ${path.relative(ROOT, ADMIN_HTML)}`);
} else {
  const html = fs.readFileSync(ADMIN_HTML, 'utf8');

  for (const rule of forbiddenFragments) {
    if (rule.pattern.test(html)) {
      errors.push(`Admin page includes forbidden ${rule.label} markup.`);
    }
  }

  for (const rule of requiredFragments) {
    if (!rule.pattern.test(html)) {
      errors.push(`Admin page missing required ${rule.label}.`);
    }
  }
}

if (errors.length > 0) {
  console.error('Admin build guard failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Admin build guard passed: admin page is isolated from public lead-capture shell.');

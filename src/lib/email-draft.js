const DEFAULT_EMAIL_SUBJECT = 'Estimate request';
const DEFAULT_EMAIL_BODY_TEMPLATE =
  'Vehicle:\nService needed:\nBest callback number:\nPhotos attached: yes/no\n\nPage: {pageTitle}\nLanguage: {language}\nURL: {pageUrl}';

function replaceTokens(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{${key}}`, value);
  }, template);
}

export function buildEstimateEmailHref({
  siteEmail,
  ui,
  pageTitle,
  languageLabel,
  pageUrl,
}) {
  const subjectBase =
    typeof ui?.emailSubject === 'string' && ui.emailSubject.trim()
      ? ui.emailSubject.trim()
      : DEFAULT_EMAIL_SUBJECT;
  const bodyTemplate =
    typeof ui?.emailBodyTemplate === 'string' && ui.emailBodyTemplate.trim()
      ? ui.emailBodyTemplate
      : DEFAULT_EMAIL_BODY_TEMPLATE;
  const subject = pageTitle ? `${subjectBase} - ${pageTitle}` : subjectBase;
  const body = replaceTokens(bodyTemplate, {
    pageTitle: pageTitle || '',
    language: languageLabel || '',
    pageUrl: pageUrl || '',
  });

  return `mailto:${siteEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

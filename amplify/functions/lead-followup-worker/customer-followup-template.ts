import { renderEmailParagraphs } from './email-rendering.ts';

export function buildCustomerFollowupEmailHtml(body: string): string {
  return `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.6;">
      ${renderEmailParagraphs(body)}
    </div>
  `;
}

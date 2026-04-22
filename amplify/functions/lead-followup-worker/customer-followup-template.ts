import { renderEmailParagraphs } from './email-rendering.ts';

export function buildCustomerFollowupEmailHtml(body: string): string {
  return `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;font-size:16px;line-height:1.6;max-width:640px;">
      ${renderEmailParagraphs(body)}
    </div>
  `;
}

import { escapeHtml } from '../_shared/text-utils.ts';

export type EmailTableRow = readonly [string, string];

export function compactEmailText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function renderEmailParagraphs(body: string): string {
  return compactEmailText(body)
    .split('\n\n')
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

export function renderPlainTextRows(rows: readonly EmailTableRow[]): string[] {
  return rows.map(([label, value]) => `${label}: ${value}`);
}

export function renderHtmlTableRows(rows: readonly EmailTableRow[]): string {
  return rows
    .map(
      ([label, value]) => `
              <tr>
                <td style="border:1px solid #ddd;background:#f7f4ef;font-weight:700;width:220px;">${escapeHtml(label)}</td>
                <td style="border:1px solid #ddd;">${escapeHtml(value)}</td>
              </tr>
            `,
    )
    .join('');
}

/**
 * HTML source used as iframe srcDoc for live preview (matches HtmlEditor behaviour).
 */
export function buildHtmlPreviewSrcdoc(html: string): string {
  return html ?? '';
}

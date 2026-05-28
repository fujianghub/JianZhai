import { apiClient } from './client';

export interface DocTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
}

export async function listDocumentTemplates(): Promise<DocTemplate[]> {
  const { data } = await apiClient.get<{ templates: DocTemplate[] }>('/document-templates/');
  return data.templates;
}

/** Substitute {{date}} / {{title}} / {{user}} placeholders client-side. */
export function applyTemplatePlaceholders(
  body: string,
  ctx: { date: string; title: string; user: string },
): string {
  return body
    .replaceAll('{{date}}', ctx.date)
    .replaceAll('{{title}}', ctx.title)
    .replaceAll('{{user}}', ctx.user);
}

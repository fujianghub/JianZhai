/**
 * Lazy DOCX → HTML conversion.
 *
 * ``mammoth`` is a large dependency only needed when a user actually opens a
 * .docx attachment. Importing it dynamically here keeps it out of the eager
 * chunks of every component that can preview attachments; it downloads on the
 * first conversion instead.
 */
export async function convertDocxToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth')).default;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

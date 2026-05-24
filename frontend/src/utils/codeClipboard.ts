import type { Node as PmNode } from '@tiptap/pm/model';

const ZWSP = '\u200b';

/** Normalize raw code text for clipboard — strip invisible chars, unify newlines. */
export function normalizeCodePlainText(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n').replace(new RegExp(ZWSP, 'g'), '');
  // Drop trailing empty lines (hljs fence often leaves one).
  text = text.replace(/\n+$/, '');
  return text;
}

/** Decode base64 UTF-8 (same encoding as markdown.ts `base64UTF8`). */
export function decodeBase64UTF8(b64: string): string {
  if (!b64) return '';
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const bin = window.atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

/** Extract plain code from a rendered `.jz-code-block` element. */
export function getCodePlainTextFromBlock(block: HTMLElement): string {
  const b64 = block.dataset.codeSource ?? block.dataset.source ?? '';
  if (b64) {
    try {
      return normalizeCodePlainText(decodeBase64UTF8(b64));
    } catch {
      /* fall through to DOM extraction */
    }
  }

  const code = block.querySelector<HTMLElement>('code');
  if (!code) return '';

  const lineEls = code.querySelectorAll<HTMLElement>('.jz-code-line');
  if (lineEls.length > 0) {
    const lines = Array.from(lineEls).map((el) => el.textContent ?? '');
    return normalizeCodePlainText(lines.join('\n'));
  }

  return normalizeCodePlainText(code.textContent ?? '');
}

/** Extract plain code from a ProseMirror code-block node. */
export function getCodePlainTextFromPmNode(node: PmNode): string {
  return normalizeCodePlainText(node.textContent ?? '');
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Write normalized plain text to the system clipboard. */
export async function writeCodeToClipboard(text: string): Promise<void> {
  const plain = normalizeCodePlainText(text);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plain);
      return;
    } catch {
      /* fall through */
    }
  }
  if (!legacyCopy(plain)) {
    throw new Error('copy failed');
  }
}

/**
 * Intercept native copy inside a code block so Ctrl+C never pulls hljs spans
 * or line-number gutters into the clipboard.
 */
export function attachCodeCopyHandler(
  el: HTMLElement,
  getText: () => string
): () => void {
  const onCopy = (e: ClipboardEvent) => {
    const selection = window.getSelection();
    const selected = selection?.toString() ?? '';
    const full = getText();
    const text = selected.trim() ? normalizeCodePlainText(selected) : full;
    if (!text) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', text);
  };
  el.addEventListener('copy', onCopy);
  return () => el.removeEventListener('copy', onCopy);
}

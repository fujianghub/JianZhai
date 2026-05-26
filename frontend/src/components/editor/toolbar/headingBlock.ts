import type { Editor } from '@tiptap/core';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export function getActiveHeadingLevel(editor: Editor): HeadingLevel | null {
  for (let level = 1; level <= 6; level++) {
    if (editor.isActive('heading', { level: level as HeadingLevel })) {
      return level as HeadingLevel;
    }
  }
  return null;
}

export function getHeadingBlockLabel(editor: Editor): string {
  const level = getActiveHeadingLevel(editor);
  return level ? `标题${level}` : '正文';
}

export function applyHeadingBlock(editor: Editor, level: HeadingLevel | 'paragraph'): void {
  if (level === 'paragraph') {
    editor.chain().focus().setParagraph().run();
    return;
  }
  editor.chain().focus().toggleHeading({ level }).run();
}

import { Mark, mergeAttributes } from '@tiptap/core';

export const AnnotationMark = Mark.create({
  name: 'annotation',

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML(el) {
          return (el as HTMLElement).getAttribute('data-annotation') ?? '';
        },
        renderHTML(attrs) {
          if (!attrs.text) return {};
          return { 'data-annotation': attrs.text as string };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-annotation]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes({ class: 'jz-annotation' }, HTMLAttributes), 0];
  },
});

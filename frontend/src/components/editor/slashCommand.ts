import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import SlashCommandList, { type SlashCommandListRef } from './SlashCommandList';
import {
  filterSlashCommands,
  trackRecentSlashCommand,
  type SlashCommandItem,
} from './slashCommandRegistry';

export type { SlashCommandItem } from './slashCommandRegistry';
export {
  trackRecentSlashCommand,
  getRecentSlashTitles,
  MERMAID_TEMPLATES,
  MERMAID_TYPE_LABELS,
  PLANTUML_TEMPLATES,
  filterSlashCommands,
  getSlashCommands,
  primaryAlias,
  formatSlashDescription,
  executeSlashCommandAtCursor,
  getSlashCommandById,
  resetSlashCommandsCache,
  matchSlashScore,
} from './slashCommandRegistry';

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        // Never trigger inside code or math — typing `/ai` in a code sample
        // used to pop the menu and mangle the snippet on selection.
        allow: ({
          state,
          range,
        }: {
          state: import('@tiptap/pm/state').EditorState;
          range: import('@tiptap/core').Range;
        }) => {
          const $from = state.doc.resolve(range.from);
          const parent = $from.parent.type;
          return !parent.spec.code && parent.name !== 'mathBlock';
        },
        command: ({
          editor,
          range,
          props,
        }: {
          editor: import('@tiptap/core').Editor;
          range: import('@tiptap/core').Range;
          props: SlashCommandItem;
        }) => {
          trackRecentSlashCommand(props.title);
          props.command({ editor, range });
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => filterSlashCommands(query),
        render: () => {
          let component: ReactRenderer<SlashCommandListRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props: { ...props, hasQuery: !!props.query },
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy(document.body, {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },
            onUpdate(props) {
              component?.updateProps({ ...props, hasQuery: !!props.query });
              if (props.clientRect && popup) {
                popup.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
              }
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit() {
              popup?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});

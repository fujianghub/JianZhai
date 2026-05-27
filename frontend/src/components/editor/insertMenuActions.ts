/** Bridge so slash commands and the quick-insert menu can trigger file pickers / modals owned by RichTextEditor. */
export interface InsertMenuActions {
  pickImage?: () => void;
  pickAttachment?: () => void;
  openMention?: () => void;
  openEmoji?: () => void;
  openAI?: () => void;
  openLink?: () => void;
}

let actions: InsertMenuActions | null = null;

export function setInsertMenuActions(next: InsertMenuActions | null): void {
  actions = next;
}

export function getInsertMenuActions(): InsertMenuActions | null {
  return actions;
}

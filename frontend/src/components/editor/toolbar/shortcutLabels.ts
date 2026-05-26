/** Platform-aware shortcut label for toolbar menus. */
export function modKey(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)) {
    return '⌘';
  }
  return 'Ctrl';
}

export function altModShortcut(digit: string): string {
  return `Alt+${modKey()}+${digit}`;
}

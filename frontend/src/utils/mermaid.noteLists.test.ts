/**
 * Note list-marker neutralisation (splitLineToFitWidth crash guard).
 *
 * Mermaid ≤11 lexes consecutive `1. …` / `- …` lines inside a multi-line
 * state-diagram note as ONE markdown list token whose text keeps its inner
 * newlines; as soon as the note is wide enough to need wrapping,
 * `splitLineToFitWidth` throws and the whole diagram fails to render.
 * `neutralizeNoteListMarkers` inserts a zero-width word joiner (U+2060)
 * between marker and delimiter so the lines are plain text — pixel-identical
 * output, no crash. Mirrored in backend diagram_render.py.
 */
import { describe, it, expect } from 'vitest';
import { neutralizeNoteListMarkers } from './mermaid';

const WJ = '⁠';

describe('neutralizeNoteListMarkers', () => {
  it('neutralises ordered and bullet markers only inside note blocks', () => {
    const src = [
      'stateDiagram-v2',
      '    1. this line is NOT in a note',
      '    note right of A',
      '        1. activate policy',
      '        2) deactivate policy',
      '        - bullet item',
      '        * star item',
      '        + plus item',
      '    end note',
      '    A --> B : 3. after the note',
    ].join('\n');
    const lines = neutralizeNoteListMarkers(src).split('\n');
    expect(lines[1]).toBe('    1. this line is NOT in a note');
    expect(lines[3]).toBe(`        1${WJ}. activate policy`);
    expect(lines[4]).toBe(`        2${WJ}) deactivate policy`);
    expect(lines[5]).toBe(`        -${WJ} bullet item`);
    expect(lines[6]).toBe(`        *${WJ} star item`);
    expect(lines[7]).toBe(`        +${WJ} plus item`);
    expect(lines[9]).toBe('    A --> B : 3. after the note');
  });

  it('skips single-line inline notes (no colon-form rewriting)', () => {
    const inline = 'stateDiagram-v2\n    note right of A : 1. inline text\n';
    expect(neutralizeNoteListMarkers(inline)).toBe(inline);
  });

  it('is idempotent (a second pass changes nothing)', () => {
    const block = 'stateDiagram-v2\n    note left of B\n        1. x\n    end note\n';
    const once = neutralizeNoteListMarkers(block);
    expect(once.split(WJ).length - 1).toBe(1);
    expect(neutralizeNoteListMarkers(once)).toBe(once);
  });

  it('leaves diagrams without notes untouched', () => {
    const src = 'graph TD\nA-->B\nB-->C\n';
    expect(neutralizeNoteListMarkers(src)).toBe(src);
  });

  it('handles a left-of note and multi-digit markers', () => {
    const src = 'stateDiagram-v2\n    note left of Failure\n        12. twelfth step\n    end note\n';
    expect(neutralizeNoteListMarkers(src)).toContain(`12${WJ}. twelfth step`);
  });
});

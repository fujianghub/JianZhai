import { describe, expect, it } from 'vitest';
import { scanInlineMath } from './inlineMathScan';

describe('scanInlineMath', () => {
  it('matches a simple inline formula', () => {
    const spans = scanInlineMath('能量 $E=mc^2$ 守恒');
    expect(spans).toHaveLength(1);
    expect(spans[0].expr).toBe('E=mc^2');
    expect('能量 $E=mc^2$ 守恒'.slice(spans[0].from, spans[0].to)).toBe('$E=mc^2$');
  });

  it('does NOT match currency like $5 to $10', () => {
    expect(scanInlineMath('价格从 $5 到 $10 不等')).toHaveLength(0);
  });

  it('does NOT match when closing $ is followed by a digit', () => {
    expect(scanInlineMath('共 $a$1 个')).toHaveLength(0);
  });

  it('rejects whitespace-padded spans', () => {
    expect(scanInlineMath('这是 $ x $ 不算')).toHaveLength(0);
    expect(scanInlineMath('这是 $x $ 不算')).toHaveLength(0);
  });

  it('skips escaped \\$ and $$ block markers', () => {
    expect(scanInlineMath('价格 \\$5\\$ 哈')).toHaveLength(0);
    expect(scanInlineMath('$$x+y$$')).toHaveLength(0);
  });

  it('does not cross newlines', () => {
    expect(scanInlineMath('$a\nb$')).toHaveLength(0);
  });

  it('finds multiple spans with correct offsets and base', () => {
    const text = '设 $a$ 与 $b^2$。';
    const spans = scanInlineMath(text, 100);
    expect(spans).toHaveLength(2);
    expect(spans[0].from).toBe(100 + text.indexOf('$a$'));
    expect(spans[1].expr).toBe('b^2');
  });

  it('handles escaped dollar inside expr', () => {
    const spans = scanInlineMath('式 $a\\$b$ 后');
    expect(spans).toHaveLength(1);
    expect(spans[0].expr).toBe('a\\$b');
  });
});

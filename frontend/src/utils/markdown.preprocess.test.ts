import { describe, expect, it } from 'vitest';
import {
  convertGfmPipeTables,
  mapOutsideFencedCodeBlocks,
  normalizeLegacyHtmlTags,
  preprocessMarkdown,
  renderMarkdown,
} from './markdown';

describe('preprocessMarkdown', () => {
  it('unwraps backticked font tags and normalizes to span', () => {
    const src = '`<font style="color:rgb(245,158,11);">\'hello/\'</font>`';
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('`');
    expect(out).not.toContain('<font');
    expect(out).toContain('<span style="color:rgb(245,158,11);">');
    expect(out).toContain("'hello/'");
  });

  it('merges bold spans split around font tags', () => {
    const src = '**A**<font style="color:#ED740C;">x</font>**B**';
    const out = preprocessMarkdown(src);
    expect(out).toContain('<strong>');
    expect(out).toContain('<span style="color:#ED740C;">');
    expect(out).not.toContain('**');
  });

  it('merges bold spans split around span tags', () => {
    const src = '**A**<span style="color:red">x</span>**B**';
    const out = preprocessMarkdown(src);
    expect(out).toContain('<strong>');
    expect(out).toContain('<span style="color:red">');
    expect(out).not.toContain('**');
  });

  it('converts GFM pipe tables to HTML tables', () => {
    const src = '| h1 | h2 |\n| --- | --- |\n| a | b |';
    const out = convertGfmPipeTables(src);
    expect(out).toContain('<table');
    expect(out).toContain('<th');
    expect(out).toContain('a');
  });

  it('unglues container fences after images', () => {
    const src = '![](https://example.com/foo.png):::info\nBody\n:::';
    const out = preprocessMarkdown(src);
    expect(out).toContain('\n\n:::info');
  });

  it('renderMarkdown does not leak literal font tags after preprocess', () => {
    const src = '| 示例 |\n| --- |\n| <font style="color:rgb(245,158,11);">code</font> |';
    const html = renderMarkdown(src);
    expect(html).not.toContain('<font');
    expect(html).toContain('code');
  });

  it('unwraps backticked bold emphasis (Yuque ORM pattern)', () => {
    const src = '`**ORM（Object-Relational Mapping，对象关系映射）**`';
    const out = preprocessMarkdown(src);
    expect(out).toContain('<strong>ORM');
    expect(out).not.toContain('`');
    expect(out).not.toContain('**ORM');
  });

  it('renderMarkdown renders backticked bold as strong, not code', () => {
    const src = '`**ORM（Object-Relational Mapping，对象关系映射）**`';
    const html = renderMarkdown(src);
    expect(html).toContain('<strong>ORM');
    expect(html).not.toContain('<code>**');
    expect(html).not.toContain('**ORM');
  });

  it('strips inner ideographic space and renders bold with parens (Yuque ORM)', () => {
    const src = '**ORM (Object-Relational Mapping, 对象关系映射) \u3000**是一种';
    const out = preprocessMarkdown(src);
    expect(out).toContain('<strong>ORM');
    expect(out).not.toContain('**ORM');
    const html = renderMarkdown(src);
    expect(html).toMatch(/<strong>ORM|<b>ORM/);
    expect(html).not.toContain('**ORM');
  });

  it('strips Yuque picture emoji before markdown images', () => {
    const src = '🖼️![](https://cdn.nlark.com/yuque/0/2026/png/foo.png)';
    const out = preprocessMarkdown(src);
    expect(out).toBe('![](https://cdn.nlark.com/yuque/0/2026/png/foo.png)');
    const html = renderMarkdown(src);
    expect(html).toContain('<img');
    expect(html).toContain('cdn.nlark.com');
  });

  it('Yuque compat: bold wrapping colored font (MVT pattern)', () => {
    const src =
      '使用 **<font style="color:rgb(245,158,11)">MVT 架构模式</font>**来组织代码。';
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('**');
    expect(out).toContain('<strong>');
    expect(out).toContain('MVT 架构模式');
    const html = renderMarkdown(src);
    expect(html).toMatch(/<strong[\s\S]*MVT 架构模式/);
    expect(html).toContain('color');
    expect(html).not.toContain('**');
  });

  it('Yuque compat: bold wrapping span after font normalize', () => {
    const src =
      '使用 **<span style="color:rgb(245,158,11)">MVT 架构模式</span>**来组织代码。';
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('**');
    expect(out).toContain('<strong><span');
    const html = renderMarkdown(src);
    expect(html).toMatch(/<strong[\s\S]*MVT/);
    expect(html).not.toContain('**');
  });
});

describe('normalizeLegacyHtmlTags', () => {
  it('maps font color attribute to span style', () => {
    const out = normalizeLegacyHtmlTags('<font color="#f59e0b">warn</font>');
    expect(out).toBe('<span style="color: #f59e0b">warn</span>');
  });

  it('handles nested font tags from inside out', () => {
    const src = '<font color="red">outer <font color="blue">inner</font> rest</font>';
    const out = normalizeLegacyHtmlTags(src);
    expect(out).not.toContain('<font');
    // Innermost first → two well-formed spans, no crossed tags.
    expect(out).toContain('<span style="color: blue">inner</span>');
    expect(out).toContain('<span style="color: red">outer ');
  });

  it('respects existing style over attribute color', () => {
    const out = normalizeLegacyHtmlTags(
      '<font color="red" style="color: blue">x</font>',
    );
    // Existing style wins — color attribute is NOT appended.
    expect(out).toBe('<span style="color: blue">x</span>');
  });

  it('accepts single-quoted attribute values', () => {
    const out = normalizeLegacyHtmlTags("<font style='color:red'>x</font>");
    expect(out).toBe('<span style="color:red">x</span>');
  });
});

describe('fence awareness', () => {
  it('mapOutsideFencedCodeBlocks leaves code fences untouched', () => {
    const src = ['outside ONE', '```js', 'const x = 1; // ONE', '```', 'outside ONE'].join('\n');
    const out = mapOutsideFencedCodeBlocks(src, (s) => s.replace(/ONE/g, 'TWO'));
    expect(out).toBe(
      ['outside TWO', '```js', 'const x = 1; // ONE', '```', 'outside TWO'].join('\n'),
    );
  });

  it('preprocessMarkdown does not rewrite font tags inside code fences', () => {
    const src = '```html\n<font color="red">x</font>\n```';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
    expect(out).toContain('<font color="red">');
  });

  it('preprocessMarkdown does not rewrite pipe tables inside code fences', () => {
    const src = '```\n| a | b |\n| --- | --- |\n| 1 | 2 |\n```';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
    expect(out).not.toContain('<table');
  });

  it('handles ~~~ fences as well as ``` fences', () => {
    const src = '~~~html\n<font color="red">x</font>\n~~~';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
  });

  it('unwraps backticked <span> like <font>', () => {
    const src = '`<span style="color:red">x</span>`';
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('`<span');
    expect(out).toContain('<span style="color:red">x</span>');
  });

  it('does not merge emphasis inside code fences', () => {
    const src = '```\n**A**<font color="red">x</font>**B**\n```';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
  });

  it('does not unwrap backticked span inside code fences', () => {
    const src = '```\n`<span style="color:red">x</span>`\n```';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
    expect(out).toContain('`<span');
  });

  it('does not unwrap backticked bold inside code fences', () => {
    const src = '```\n`**x**`\n```';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
    expect(out).toContain('`**x**`');
  });

  it('does not strip Yuque emoji inside code fences', () => {
    const src = '```\n🖼️![](http://example.com/x.png)\n```';
    const out = preprocessMarkdown(src);
    expect(out).toBe(src);
  });

  it('preprocessMarkdown is idempotent on a representative Yuque sample', () => {
    const src = [
      '![](https://example.com/x.png):::info',
      '**Title**',
      '`<font color="red">err</font>`',
      ':::',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');
    const once = preprocessMarkdown(src);
    const twice = preprocessMarkdown(once);
    expect(twice).toBe(once);
  });
});

describe('convertGfmPipeTables short-circuit', () => {
  it('returns input unchanged when no pipe lines present', () => {
    const src = 'plain text with no tables\nstill plain';
    const out = convertGfmPipeTables(src);
    expect(out).toBe(src);
  });

  it('does not transform single pipe line without separator', () => {
    const src = '| just a single line |';
    const out = convertGfmPipeTables(src);
    expect(out).toBe(src);
    expect(out).not.toContain('<table');
  });
});

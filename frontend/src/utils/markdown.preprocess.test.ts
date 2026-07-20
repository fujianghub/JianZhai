import { describe, expect, it } from 'vitest';
import {
  convertGfmPipeTables,
  recoverYuqueDiagramComments,
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

  it('wraps converted pipe tables in a .jz-table-wrap scroll container', () => {
    const src = '| h1 | h2 |\n| --- | --- |\n| a | b |';
    const out = convertGfmPipeTables(src);
    const wrapAt = out.indexOf('<div class="jz-table-wrap">');
    expect(wrapAt).toBeGreaterThanOrEqual(0);
    expect(wrapAt).toBeLessThan(out.indexOf('<table'));
    expect(out.trimEnd().endsWith('</div>')).toBe(true);
    // single html_block chunk: no blank line may split the wrapper from the table
    expect(out).not.toMatch(/jz-table-wrap">\n\s*\n/);
  });

  it('renderMarkdown keeps the table scroll wrapper through sanitize', () => {
    const html = renderMarkdown('| h1 | h2 |\n| --- | --- |\n| a | b |');
    expect(html).toContain('jz-table-wrap');
    expect(html).toContain('<table');
  });

  it('unglues container fences after images', () => {
    const src = '![](https://example.com/foo.png):::info\nBody\n:::';
    const out = preprocessMarkdown(src);
    expect(out).toContain('\n\n:::info');
  });

  it('leaves literal ::: inside inline code spans alone (docs table cell)', () => {
    // dev-guide detailed.md §6.2 — `:::details 标题` shown as inline code in a
    // table row must not be split into a real container (it broke the table).
    const row = '| 折叠块 | `:::details 标题` ↔ `<details>` | `DetailsBlock.ts` |';
    const src = `| 节点 | 语法 | 文件 |\n| --- | --- | --- |\n${row}\n| 分栏 | \`:::cols-2\` / \`:::tabs\` | \`Columns.ts\` |`;
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('\n\n:::details');
    expect(out).not.toContain('\n\n:::cols-2');
    expect(out).not.toContain('\n\n:::tabs');
  });

  it('renderMarkdown keeps a docs table with inline-code ::: intact', () => {
    const src =
      '| 节点 | 语法 |\n| --- | --- |\n| 折叠块 | `:::details 标题` |\n| 分栏 | `:::cols-2` |';
    const html = renderMarkdown(src);
    expect(html).toContain('<table');
    expect(html).toContain(':::details 标题');
    expect(html).not.toContain('jz-callout');
    expect(html).not.toContain('<details');
  });

  it('does not unglue ::: inside fenced code blocks', () => {
    const src = '```\nfoo:::info glued in code\n```\nafter';
    const out = preprocessMarkdown(src);
    expect(out).toContain('foo:::info glued in code');
    expect(out).not.toContain('foo\n\n:::info');
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

describe('link-card / doc-card block placeholders', () => {
  it('converts a whole-line [[link-card:URL]] into a hydration shell', () => {
    const out = preprocessMarkdown('上文\n\n[[link-card:https://github.com/a?b=1&c=2]]\n\n下文');
    expect(out).toContain('data-jz-link-card');
    expect(out).toContain('data-url="https://github.com/a?b=1&amp;c=2"');
    expect(out).toContain('jz-link-card-site-name">github.com<');
    expect(out).not.toContain('[[link-card:');
  });

  it('escapes attribute-breaking urls', () => {
    const out = preprocessMarkdown('[[link-card:https://a.com/"onmouseover="x]]');
    expect(out).not.toContain('data-url="https://a.com/"onmouseover');
    expect(out).toContain('&quot;');
  });

  it('keeps inline occurrences and fenced code literal', () => {
    const inline = preprocessMarkdown('前 [[link-card:https://a.com]] 后');
    expect(inline).toContain('[[link-card:https://a.com]]');
    const fenced = preprocessMarkdown('```\n[[link-card:https://a.com]]\n```');
    expect(fenced).toContain('[[link-card:https://a.com]]');
    expect(fenced).not.toContain('data-jz-link-card');
  });

  it('keeps the doc-card shell unchanged', () => {
    const out = preprocessMarkdown('[[doc-card:42]]');
    expect(out).toContain('data-jz-doc-card');
    expect(out).toContain('href="/d/42"');
    expect(out).toContain('文档卡片 #42');
  });

  it('renderMarkdown keeps the link-card shell (sanitizer allowlist)', () => {
    const html = renderMarkdown('[[link-card:https://github.com]]');
    expect(html).toContain('data-jz-link-card');
    expect(html).toContain('data-url="https://github.com"');
    expect(html).toContain('target="_blank"');
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

describe('editor markdown gold samples', () => {
  it('preserves callout container syntax', () => {
    const src = ':::info\nNote body\n:::';
    const out = preprocessMarkdown(src);
    expect(out).toContain(':::info');
    expect(out).toContain('Note body');
  });

  it('converts details block to structural HTML (no callout hijack)', () => {
    // v0.9.11：:::details 在 preprocess 阶段就转成 <details>/<summary> ——
    // 留成字面 ::: 会被 catch-all callout 容器吞掉，摘要永久丢失。
    const src = ':::details Summary\n\nInner\n:::';
    const out = preprocessMarkdown(src);
    expect(out).toContain('<details class="jz-details-block">');
    expect(out).toContain('<summary>Summary</summary>');
    expect(out).toContain('Inner');
  });

  it('preserves GFM task list markers', () => {
    const src = '- [ ] todo\n- [x] done';
    const out = preprocessMarkdown(src);
    expect(out).toContain('[ ]');
    expect(out).toContain('[x]');
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

/**
 * Regression: a former normalizeYuqueEmphasis step merged ``**A**B**C**``
 * into ``**ABC**`` whenever the connector B had no ASCII space. CJK prose
 * never has spaces, so every sentence with two legitimate bold spans was
 * corrupted — plain text swallowed into a giant bold, or (when the regex
 * re-anchored on a previous bold's closer) a span's markers silently
 * deleted. Real sentences from a Yuque-exported doc (2026-07-19).
 */
describe('adjacent CJK bold spans stay independent', () => {
  it('keeps two bolds separated by CJK punctuation as two <strong>', () => {
    const src =
      '老鼠流与大象流描述的是**流的规模和持续时间**；熵描述的是**流量分布的不确定性**。二者是彼此独立的两个维度。';
    const html = renderMarkdown(src);
    expect(html).toContain('<strong>流的规模和持续时间</strong>');
    expect(html).toContain('<strong>流量分布的不确定性</strong>');
    // the connector must stay OUTSIDE any bold
    expect(html).not.toMatch(/<strong>[^<]*；熵描述的是/);
  });

  it('keeps four bolds in one blockquote line as four <strong>', () => {
    const src =
      '> 传统云数据中心的业务网络**通常**由大量老鼠流构成，因此五元组分布**往往**具有较高的熵；大规模 AI 训练的**后端网络通常**由大象流主导，因此**流量矩阵**往往具有较低的熵。';
    const html = renderMarkdown(src);
    expect(html).toContain('<strong>通常</strong>');
    expect(html).toContain('<strong>往往</strong>');
    expect(html).toContain('<strong>后端网络通常</strong>');
    expect(html).toContain('<strong>流量矩阵</strong>');
  });

  it('does not delete a bold span inside a table cell (closer/opener mis-pair)', () => {
    // The first cell's trailing ``**`` used to be mis-paired with the next
    // bold's opener, silently stripping the middle span's markers.
    const src =
      '| 主题 | 一句话 |\n| --- | --- |\n| **最重要的区别** | 老鼠流/大象流描述**一条流有多大、持续多久**；低熵/高熵描述**流量分布有多集中、模式有多难预测**。 |';
    const html = renderMarkdown(src);
    expect(html).toContain('<strong>最重要的区别</strong>');
    expect(html).toContain('<strong>一条流有多大、持续多久</strong>');
    expect(html).toContain('<strong>流量分布有多集中、模式有多难预测</strong>');
  });
});

/**
 * Regression: Yuque exports diagrams as ``<!-- 这是一个文本绘图，源码为：… -->``
 * comments + a static SVG image. The generic comment strip truncated at the
 * first ``-->`` INSIDE the source (flowchart arrows), leaking the rest as
 * visible text — including ``:::jam`` class shorthands that spawned runaway
 * callout containers. Recovery turns the comment into a native mermaid fence
 * and drops the static image. Snippets from the real doc (id 501).
 */
describe('recoverYuqueDiagramComments', () => {
  const COMMENT =
    '<!-- 这是一个文本绘图，源码为：flowchart LR\n' +
    '    E1["大象流 A"] --> H{"ECMP 哈希"}\n' +
    '    H --> P1["路径 1 · 利用率 100%"]:::jam\n' +
    '    H --> P3["路径 3 · 利用率 20%"]:::idle\n' +
    '    classDef jam fill:#4a1f1f,stroke:#c0392b,color:#ffe0e0\n' +
    '    class E1 flow -->\n' +
    '![](/media/uploads/2026/07/d2665988843143bd8194b748653813fa.svg)';

  it('recovers the whole source into one mermaid fence despite internal -->', () => {
    const out = recoverYuqueDiagramComments(COMMENT);
    expect(out).toContain('```mermaid\n');
    // full source captured — nothing truncated at the first arrow
    expect(out).toContain('classDef jam');
    expect(out).toContain(':::idle');
    // static image dropped
    expect(out).not.toContain('![](/media/uploads');
    expect(out).not.toContain('<!--');
  });

  it('renderMarkdown shows a diagram block with zero leaked source text', () => {
    const html = renderMarkdown(`前文。\n\n${COMMENT}\n\n后文。`);
    expect(html).toContain('jz-code-mermaid');
    // Leaked source would appear as paragraph text. (The hidden
    // ``jz-mermaid-source`` <pre> inside the diagram block legitimately
    // contains the source — that's the source-toggle feature, not a leak.)
    expect(html).not.toMatch(/<p>[^<]*classDef/);
    // the :::jam shorthand must not become a runaway callout
    expect(html).not.toContain('jz-callout-jam');
    expect(html).toContain('后文。');
  });

  it('keeps a plantuml source as a plantuml fence', () => {
    const src = '<!-- 这是一个文本绘图，源码为：@startuml\nA --> B\n@enduml -->\n![](/media/x.svg)';
    const out = recoverYuqueDiagramComments(src);
    expect(out).toContain('```plantuml\n@startuml');
  });
});

/**
 * Regression: Yuque's inverted colour pattern — a colored sentence with bold
 * colored words inside: ``<font>plain</font>**<font>bold</font>**<font>…``.
 * Step (0) of normalizeYuqueEmphasis (split-bold-around-tag merge) used to
 * match the whole-tag chunks as its A/B connectors and merge everything into
 * one giant bold, turning the entire sentence bold. Real line from doc 501
 * §12.
 */
describe('colored sentence with inner bold colored words', () => {
  it('keeps only the bold words bold, not the whole sentence', () => {
    const src =
      '<font style="color:#C75C00;">传统云数据中心的业务网络</font>**<font style="color:#C75C00;">通常</font>**<font style="color:#C75C00;">由大量短小、分散且动态的老鼠流构成，因此源—目的通信关系和五元组分布</font>**<font style="color:#C75C00;">往往</font>**<font style="color:#C75C00;">具有较高的熵；</font>';
    const html = renderMarkdown(src);
    expect(html).toContain('<strong><span style="color:#C75C00;">通常</span></strong>');
    expect(html).toContain('<strong><span style="color:#C75C00;">往往</span></strong>');
    // the plain colored run between the two bold words must stay OUTSIDE any
    // <strong>: it follows 通常's closing </strong> as a bare <span>
    expect(html).toContain('</strong><span style="color:#C75C00;">由大量短小');
    expect(html).not.toContain('<strong><span style="color:#C75C00;">由大量');
  });
});

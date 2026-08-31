import { describe, expect, it } from 'vitest';
import {
  convertBacktickedStyledCode,
  convertGfmPipeTables,
  normalizeItalicWrappingInlineHtml,
  recoverYuqueDiagramComments,
  mapOutsideFencedCodeBlocks,
  normalizeLegacyHtmlTags,
  preprocessMarkdown,
  renderMarkdown,
} from './markdown';

describe('preprocessMarkdown', () => {
  it('converts backticked font tags into a code chip (colour dropped)', () => {
    // 2026-09-01：语义反转——语雀把彩色行内代码的染色标签导出在反引号内部，
    // 旧行为剥反引号只留颜色，代码语义整个丢失（「颜色块不支持行内代码」）。
    // 现在保代码丢颜色：芯片配色走 --jz-code-inline-* 六主题令牌。
    const src = '`<font style="color:rgb(245,158,11);">\'hello/\'</font>`';
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('`');
    expect(out).not.toContain('<font');
    expect(out).toContain("<code>'hello/'</code>");
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

/**
 * 「颜色块/表格不支持行内代码」修复（2026-09-01，真实样本来自线上 doc 1002
 * 《Route Preference》）。语雀把彩色行内代码的 <font>/<span> 染色标签导出在
 * 反引号内部；旧管线要么剥反引号丢代码语义、要么让 code_inline 转义出字面
 * 标签垃圾。表格路径本身无辜——管道表格转 HTML 前反引号已在兼容层被剥。
 */
describe('convertBacktickedStyledCode (colored inline code)', () => {
  it('turns a backticked font tag into a code chip, colour dropped', () => {
    const src = '`<font style="color:rgb(77, 82, 89);">preference</font>`';
    expect(preprocessMarkdown(src)).toBe('<code>preference</code>');
    const html = renderMarkdown(src);
    expect(html).toContain('<code>preference</code>');
    expect(html).not.toContain('rgb(77, 82, 89)');
  });

  it('keeps single-underscore italic inside the chip as <em>', () => {
    // `_<font>…</font>_` 组合旧时两个 unwrap 都不匹配 → 芯片里显示字面
    // <span style="…"> 转义垃圾。
    const src = '`_<font style="color:rgb(88, 88, 91);">external dist1</font>_`';
    expect(preprocessMarkdown(src)).toBe('<code><em>external dist1</em></code>');
  });

  it('converts a multi-run command line into one chip with strong/em', () => {
    const src =
      '`**<font style="color:rgb(64, 64, 64);">distance ospf</font>**<font style="color:rgb(64, 64, 64);"> {</font>**<font style="color:rgb(64, 64, 64);">intra-area</font>**<font style="color:rgb(64, 64, 64);"> </font>_<font style="color:rgb(64, 64, 64);">distance-value</font>_<font style="color:rgb(64, 64, 64);">}</font>`';
    expect(preprocessMarkdown(src)).toBe(
      '<code><strong>distance ospf</strong> {<strong>intra-area</strong> <em>distance-value</em>}</code>',
    );
  });

  it('renders colored inline code inside a table cell as <td>…<code>', () => {
    const src = [
      '| 类型 | 值 | 说明 |',
      '| --- | --- | --- |',
      '| LDP | 9 | LDP `<font style="color:rgb(77, 82, 89);">preference</font>` 语句 |',
    ].join('\n');
    const html = renderMarkdown(src);
    expect(html).toContain('<table');
    expect(html).toContain('LDP <code>preference</code> 语句');
    expect(html).not.toContain('&lt;font');
    expect(html).not.toContain('&lt;span');
  });

  it('plain inline code in a table cell still renders as code (regression)', () => {
    const html = renderMarkdown('| a |\n| --- |\n| `distance ospf` |');
    expect(html).toContain('<code>distance ospf</code>');
  });

  it('leaves backticked bodies with non-presentational tags untouched', () => {
    const src = '`<font><div>x</div></font>`';
    expect(convertBacktickedStyledCode(src)).toBe(src);
  });

  it('does not touch pure-bold backticks (old unwrap path keeps handling them)', () => {
    const src = '`**ORM**`';
    expect(convertBacktickedStyledCode(src)).toBe(src);
  });

  it('neutralizes leftover markdown-active chars so <code> content stays literal', () => {
    const src = '`<font style="color:red">show route [detail]</font>`';
    const out = preprocessMarkdown(src);
    expect(out).toBe('<code>show route &#91;detail&#93;</code>');
    const html = renderMarkdown(src);
    expect(html).toContain('[detail]');
    expect(html).not.toContain('<a ');
  });

  it('does not fire inside fenced code blocks', () => {
    const src = '```\n`<font style="color:red">x</font>`\n```';
    expect(preprocessMarkdown(src)).toBe(src);
  });
});

/**
 * normalizeBoldWrappingInlineHtml 的斜体孪生（2026-09-01，真实样本=线上
 * doc 1002 参数表）。语雀相邻斜体粘连 ``_A__B_``：中间 ``__`` 按 CommonMark
 * 侧翼规则（前标点后 CJK 字母）只能开不能闭 → 配对全乱留字面 ``_``。
 */
describe('normalizeItalicWrappingInlineHtml (CJK glued italic + color)', () => {
  const CELL =
    '_<font style="color:rgb(88, 88, 91);">（可选）为从其他路由域通过重分发（redistribution）学习到的路由设置管理距离。取值范围 1 到 255。</font>__默认值为 110。_';

  it('converts tag-wrapped italic to <em>; glued bare tail self-heals', () => {
    const out = preprocessMarkdown(CELL);
    expect(out).toContain('<em><span style="color:rgb(88, 88, 91);">（可选）');
    expect(out).toContain('</span></em>_默认值为 110。_');
    const html = renderMarkdown(CELL);
    expect(html).toContain('（可选）');
    expect(html).toContain('<em>默认值为 110。</em>');
    expect(html).not.toContain('_');
  });

  it('renders the real 参数表 row: two ems in the cell, zero literal underscores', () => {
    const src = ['| 参数 | 说明 |', '| :--- | :--- |', `| x | ${CELL} |`].join('\n');
    const html = renderMarkdown(src);
    expect(html).toContain('<table');
    expect((html.match(/<em>/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain('_');
  });

  it('works mid-sentence where flanking rules alone would fail', () => {
    // 开 ``_`` 前是 CJK 字母、后是 ``<`` 标点 → 侧翼规则判非左翼，原生解析
    // 整段退化字面下划线。
    const src = '句中文字_<span style="color:red">强调</span>_接着继续';
    const html = renderMarkdown(src);
    expect(html).toContain('<em><span style="color:red">强调</span></em>');
    expect(html).not.toContain('_');
  });

  it('keeps chained glued italic spans each in their own em', () => {
    const src = '_<span>甲</span>__<span>乙</span>_';
    expect(normalizeItalicWrappingInlineHtml(src)).toBe(
      '<em><span>甲</span></em><em><span>乙</span></em>',
    );
  });

  it('never touches URLs, snake_case, or bare CJK italics', () => {
    const url = 'https://docs.example.com/a?TocPath=%25257C_____0';
    expect(normalizeItalicWrappingInlineHtml(url)).toBe(url);
    expect(normalizeItalicWrappingInlineHtml('a_b_c')).toBe('a_b_c');
    expect(normalizeItalicWrappingInlineHtml('_中文_')).toBe('_中文_');
  });

  it('double-underscore bold wrapping tags still goes to strong (order snapshot)', () => {
    // bold 孪生先跑（reWholeAlt 收 ``__<tag>…</tag>__``），斜体孪生不接手。
    const out = preprocessMarkdown('__<span style="color:red">x</span>__');
    expect(out).toContain('<strong><span style="color:red">x</span></strong>');
    expect(out).not.toContain('<em>');
  });

  it('does not fire inside fenced code blocks', () => {
    const src = '```\n_<span style="color:red">x</span>_\n```';
    expect(preprocessMarkdown(src)).toBe(src);
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

  it('converts backticked <span> to a code chip like <font>', () => {
    const src = '`<span style="color:red">x</span>`';
    const out = preprocessMarkdown(src);
    expect(out).not.toContain('`<span');
    expect(out).toContain('<code>x</code>');
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
 * Regression: URLs containing 4+ consecutive underscores (Hillstone docs'
 * ``TocPath=…%25257C_____0``) used to be rewritten by the Yuque adjacent-bold
 * splitter (``_{4,}`` → ``__ __``), inserting a space INSIDE the link
 * destination. The link then stopped parsing, and the rich editor's next
 * save round-trip permanently corrupted raw_content (escaped brackets +
 * partial autolink, escalating each round — real docs 444/438).
 */
describe('URLs survive Yuque emphasis normalization', () => {
  const HILLSTONE =
    'https://docs.hillstonenet.com.cn/dist/#/DOC_DETAILS?id=2366&page=%23101_Firewall%2Fzone_intro.htm%3FTocPath%3D%2525E9%252598%2525B2%2525E7%252581%2525AB%2525E5%2525A2%252599%25257C%2525E5%2525AE%252589%2525E5%252585%2525A8%2525E5%25259F%25259F%25257C_____0';

  it('keeps a link destination with 5 consecutive underscores byte-identical', () => {
    const src = `安全域配置：[HillStone安全区域配置](${HILLSTONE})`;
    expect(preprocessMarkdown(src)).toBe(src);
  });

  it('renders that link as a real <a> with the untouched href', () => {
    const html = renderMarkdown(`[HillStone安全区域配置](${HILLSTONE})`);
    expect(html).toContain('_____0');
    expect(html).toContain('>HillStone安全区域配置</a>');
    expect(html).not.toContain('__ __');
  });

  it('keeps bare URLs and autolinks with underscore/asterisk runs untouched', () => {
    const src = `见 ${HILLSTONE} 与 <https://example.com/a____b> 及 https://example.com/x****y`;
    expect(preprocessMarkdown(src)).toBe(src);
  });

  it('still splits 4+ underscore/asterisk runs in plain text (Yuque adjacent bolds)', () => {
    expect(preprocessMarkdown('__A____B__')).toBe('__A__ __B__');
    // ``**``: after the split, step (4) merges the adjacent bolds back into one.
    expect(preprocessMarkdown('**A****B**')).toBe('**A B**');
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

/**
 * 语雀导出的空格包裹公式抢救（rescueSpacePaddedDollarMath）。真实样本来自
 * doc 516（NUMA 架构）与 doc 503（AI Infra）：``$ … $`` 两侧留白撞上货币
 * 防误判边界规则退化为纯文本，叠加丢反斜杠方括号 / 双反斜杠命令两类畸变。
 */
describe('rescueSpacePaddedDollarMath', () => {
  it('rescues doc-516 form: space-padded + lost-backslash display brackets', () => {
    const src = '前文\n\n$ [ B_{\\text{total}}\\approx2B ] $\n\n后文';
    const out = preprocessMarkdown(src);
    expect(out).toContain('$$\nB_{\\text{total}}\\approx2B\n$$');
    expect(out).not.toContain('$ [');
    const html = renderMarkdown(src);
    expect(html).toContain('jz-math-block');
    expect(html).not.toContain('jz-math-error');
  });

  it('rescues doc-503 form: double-escaped \\\\frac restored to \\frac', () => {
    const src = '$ MFU = \\\\frac{模型实际获得的有效计算吞吐}{GPU 理论峰值计算吞吐} $';
    const out = preprocessMarkdown(src);
    expect(out).toContain('$$\nMFU = \\frac{模型实际获得的有效计算吞吐}{GPU 理论峰值计算吞吐}\n$$');
  });

  it('keeps interval-union brackets that are not a display wrapper', () => {
    const src = '$ [0,1] \\cup [2,3] $';
    expect(preprocessMarkdown(src)).toContain('$$\n[0,1] \\cup [2,3]\n$$');
  });

  it('leaves currency and non-LaTeX padded dollars alone', () => {
    expect(preprocessMarkdown('单价在 $ 5 到 10 $ 之间')).toContain('$ 5 到 10 $');
    expect(preprocessMarkdown('$ x + y $')).toContain('$ x + y $');
  });

  it('leaves already-valid inline math and fenced code alone', () => {
    expect(preprocessMarkdown('$E=mc^2$')).toContain('$E=mc^2$');
    const fenced = '```\n$ \\alpha $\n```';
    expect(preprocessMarkdown(fenced)).toContain('$ \\alpha $');
  });

  it('does not fire mid-line (real row-break \\\\ untouched elsewhere)', () => {
    const src = '价格 $ \\alpha $ 收尾还有字';
    expect(preprocessMarkdown(src)).toContain('$ \\alpha $');
  });
});

import { describe, expect, it } from 'vitest';
import { calloutOpener, parseCalloutInfo } from './CalloutExtension';

describe('parseCalloutInfo（与阅读端 markdown.ts callout 规则镜像）', () => {
  it('无标题：仅 kind', () => {
    expect(parseCalloutInfo('info')).toEqual({ kind: 'info', title: '' });
  });
  it('显式标题被完整保留', () => {
    expect(parseCalloutInfo('info 自定义标题 带空格')).toEqual({
      kind: 'info',
      title: '自定义标题 带空格',
    });
  });
  it('kind 归一化：小写 + 剥非 a-z0-9_-（与阅读端一致）', () => {
    expect(parseCalloutInfo('Info! 标题').kind).toBe('info');
    expect(parseCalloutInfo('COLOR-2').kind).toBe('color-2');
  });
  it('全被剥空的 slug 回退 tips', () => {
    expect(parseCalloutInfo('！！！').kind).toBe('tips');
  });
  it('前后空白不影响解析', () => {
    expect(parseCalloutInfo('  note  提示  ')).toEqual({ kind: 'note', title: '提示' });
  });
});

describe('calloutOpener（serialize 输出）', () => {
  it('无标题输出 :::kind', () => {
    expect(calloutOpener('info')).toBe(':::info');
    expect(calloutOpener('info', '')).toBe(':::info');
  });
  it('带标题输出 :::kind Title（round-trip 不再丢标题）', () => {
    expect(calloutOpener('info', '自定义标题')).toBe(':::info 自定义标题');
  });
  it('标题中的换行被压成空格（否则截断 container info 串）', () => {
    expect(calloutOpener('note', '一行\n二行')).toBe(':::note 一行 二行');
  });
  it('kind 缺省回退 tips、非法字符剥除', () => {
    expect(calloutOpener(undefined, '')).toBe(':::tips');
    expect(calloutOpener('in<fo>')).toBe(':::info');
  });
  it('opener 再经 parseCalloutInfo 解析回同一 kind/title', () => {
    const opener = calloutOpener('warning', '当心 空格');
    expect(parseCalloutInfo(opener.slice(3))).toEqual({ kind: 'warning', title: '当心 空格' });
  });
});

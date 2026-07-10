import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/attachments', () => ({
  importBatch: vi.fn(),
}));

import { importBatch, type BatchImportResult } from '@/api/attachments';
import {
  checkUploadFile,
  collectDroppedItems,
  collectPickedFiles,
  planUploadChunks,
  runChunkedImport,
  skippedSummary,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_FILE_SIZE,
} from './uploadBatch';

const importBatchMock = vi.mocked(importBatch);

function makeFile(name: string, size = 10): File {
  const f = new File(['x'], name);
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function okResult(names: string[]): BatchImportResult {
  return {
    created: names.map((n, i) => ({
      id: i + 1,
      title: n,
      folder: null,
      knowledge_base: 1,
    })),
    errors: [],
    folders_created: 0,
  };
}

beforeEach(() => {
  importBatchMock.mockReset();
});

describe('upload rules', () => {
  it('UPLOAD_ACCEPT 覆盖 20 种扩展名', () => {
    expect(UPLOAD_ACCEPT.split(',')).toHaveLength(20);
    expect(UPLOAD_ACCEPT).toContain('.docx');
    expect(UPLOAD_ACCEPT).toContain('.pptx');
    expect(UPLOAD_ACCEPT).toContain('.ppt');
    expect(UPLOAD_ACCEPT).toContain('.md');
  });

  it('checkUploadFile 拒绝不支持类型与超大文件', () => {
    expect(checkUploadFile(makeFile('a.md'))).toBeNull();
    expect(checkUploadFile(makeFile('a.exe'))).toMatch('不支持');
    expect(checkUploadFile(makeFile('big.md', UPLOAD_MAX_FILE_SIZE + 1))).toMatch('2GB');
  });

  it('collectPickedFiles 过滤隐藏文件并按 preserveTree 决定路径', () => {
    const files = [makeFile('a.md'), makeFile('.DS_Store.md'), makeFile('b.exe')];
    const flat = collectPickedFiles(files, false);
    expect(flat.items.map((i) => i.relativePath)).toEqual(['']);
    expect(flat.skipped).toHaveLength(2);

    const treed = makeFile('c.md');
    Object.defineProperty(treed, 'webkitRelativePath', { value: 'Dir/sub/c.md' });
    const withTree = collectPickedFiles([treed], true);
    expect(withTree.items[0].relativePath).toBe('Dir/sub/c.md');

    const hiddenDir = makeFile('d.md');
    Object.defineProperty(hiddenDir, 'webkitRelativePath', { value: 'Dir/.git/d.md' });
    expect(collectPickedFiles([hiddenDir], true).items).toHaveLength(0);
  });
});

describe('runChunkedImport', () => {
  it('按 chunkSize 分片并聚合结果，每片后回调 onChunkDone', async () => {
    const items = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((n) => ({
      file: makeFile(n),
      relativePath: '',
    }));
    importBatchMock.mockImplementation(async (chunk) =>
      okResult(chunk.map((it) => it.file.name))
    );
    const chunkDone = vi.fn();
    const result = await runChunkedImport(items, 1, null, { onChunkDone: chunkDone }, 2);

    expect(importBatchMock).toHaveBeenCalledTimes(3);
    expect(importBatchMock.mock.calls[0][0]).toHaveLength(2);
    expect(importBatchMock.mock.calls[2][0]).toHaveLength(1);
    expect(result.created).toHaveLength(5);
    expect(chunkDone).toHaveBeenCalledTimes(3);
  });

  it('单片失败不中断整批：400 响应带结构则并入，否则整片记错', async () => {
    const items = ['a.md', 'b.md', 'c.md', 'd.md'].map((n) => ({
      file: makeFile(n),
      relativePath: '',
    }));
    importBatchMock
      .mockRejectedValueOnce({
        response: {
          data: {
            created: [],
            errors: [{ name: 'a.md', detail: '不支持' }, { name: 'b.md', detail: '不支持' }],
            folders_created: 0,
          },
        },
      })
      .mockResolvedValueOnce(okResult(['c.md', 'd.md']));

    const result = await runChunkedImport(items, 1, null, {}, 2);
    expect(result.created.map((c) => c.title)).toEqual(['c.md', 'd.md']);
    expect(result.errors).toHaveLength(2);
  });

  it('网络级失败整片记错并继续', async () => {
    const items = ['a.md', 'b.md', 'c.md'].map((n) => ({
      file: makeFile(n),
      relativePath: '',
    }));
    importBatchMock
      .mockRejectedValueOnce(new Error('timeout of 1800000ms exceeded'))
      .mockResolvedValueOnce(okResult(['c.md']));

    const result = await runChunkedImport(items, 1, null, {}, 2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].detail).toMatch('timeout');
    expect(result.created.map((c) => c.title)).toEqual(['c.md']);
  });

  it('字节进度跨片聚合且单调推进到 total', async () => {
    const items = [makeFile('a.md', 100), makeFile('b.md', 300)].map((f) => ({
      file: f,
      relativePath: '',
    }));
    importBatchMock.mockImplementation(async (chunk, _kb, _folder, onProgress) => {
      onProgress?.(50, 100); // 模拟半程
      onProgress?.(100, 100);
      return okResult(chunk.map((it) => it.file.name));
    });
    const seen: number[] = [];
    await runChunkedImport(items, 1, null, {
      onProgress: (loaded, total) => {
        expect(total).toBe(400);
        seen.push(loaded);
      },
    }, 1);
    expect(seen[seen.length - 1]).toBe(400);
    // 单调不回退
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
});

describe('collectDroppedItems', () => {
  function fileEntry(name: string, size = 10) {
    return {
      isFile: true,
      isDirectory: false,
      name,
      file: (resolve: (f: File) => void) => resolve(makeFile(name, size)),
    };
  }
  function dirEntry(name: string, children: unknown[]) {
    let drained = false;
    return {
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => ({
        readEntries: (resolve: (e: unknown[]) => void) => {
          // 模拟 Chrome 的两段式 readEntries：先返回内容，再返回空数组
          if (drained) resolve([]);
          else {
            drained = true;
            resolve(children);
          }
        },
      }),
    };
  }
  function fakeDataTransfer(entries: unknown[]): DataTransfer {
    return {
      items: entries.map((e) => ({
        kind: 'file',
        webkitGetAsEntry: () => e,
        getAsFile: () => null,
      })),
    } as unknown as DataTransfer;
  }

  it('混合拖入多文件 + 多文件夹，保留目录结构', async () => {
    const dt = fakeDataTransfer([
      fileEntry('root.md'),
      dirEntry('DirA', [fileEntry('a1.md'), dirEntry('sub', [fileEntry('deep.md')])]),
      dirEntry('DirB', [fileEntry('b1.md')]),
    ]);
    const out = await collectDroppedItems(dt);
    expect(out.items.map((i) => i.relativePath).sort()).toEqual([
      '',
      'DirA/a1.md',
      'DirA/sub/deep.md',
      'DirB/b1.md',
    ]);
    expect(out.skipped).toHaveLength(0);
  });

  it('跳过隐藏目录与不支持的文件', async () => {
    const dt = fakeDataTransfer([
      dirEntry('Dir', [fileEntry('ok.md'), fileEntry('bad.exe'), dirEntry('.git', [fileEntry('x.md')])]),
    ]);
    const out = await collectDroppedItems(dt);
    expect(out.items.map((i) => i.relativePath)).toEqual(['Dir/ok.md']);
    expect(out.skipped).toHaveLength(2);
  });
});

describe('planUploadChunks', () => {
  const item = (rel: string) => ({
    file: makeFile(rel.split('/').pop() || rel),
    relativePath: rel,
  });

  it('含 markdown + 图片的文件夹整组发一个请求（保证改写成立）', () => {
    const items = [
      item('教程/教程.md'),
      item('教程/images/a.png'),
      item('教程/images/b.svg'),
      item('教程/images/c.png'),
    ];
    const plan = planUploadChunks(items, 2);
    // 4 个文件本应切成 2 片，但同组含文档+图片 → 整组 1 片
    expect(plan).toHaveLength(1);
    expect(plan[0]).toHaveLength(4);
  });

  it('纯图片文件夹仍按 chunkSize 切片（渐进刷新）', () => {
    const items = ['p/1.png', 'p/2.png', 'p/3.png'].map(item);
    const plan = planUploadChunks(items, 2);
    expect(plan.map((c) => c.length)).toEqual([2, 1]);
  });

  it('散文件（无目录）按 chunkSize 切片', () => {
    const items = ['a.md', 'b.md', 'c.md'].map((n) => ({
      file: makeFile(n),
      relativePath: '',
    }));
    const plan = planUploadChunks(items, 2);
    expect(plan.map((c) => c.length)).toEqual([2, 1]);
  });

  it('多个文件夹各自独立分组', () => {
    const items = [
      item('A/a.md'),
      item('A/images/x.png'),
      item('B/1.png'),
      item('B/2.png'),
      item('B/3.png'),
    ];
    const plan = planUploadChunks(items, 2);
    // A 组整发(1 片)，B 组纯图片按 2 切(2 片)
    expect(plan).toHaveLength(3);
    expect(plan[0]).toHaveLength(2); // A 组 md+png
    expect(plan[1]).toHaveLength(2); // B 组前两张
    expect(plan[2]).toHaveLength(1); // B 组第三张
  });
});

describe('skippedSummary', () => {
  it('最多列 3 个名字', () => {
    expect(skippedSummary(['a', 'b'])).toBe('已跳过 2 个文件：a、b');
    expect(skippedSummary(['a', 'b', 'c', 'd'])).toMatch('…');
  });
});

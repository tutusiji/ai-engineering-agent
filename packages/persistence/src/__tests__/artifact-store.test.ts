// packages/persistence/src/__tests__/artifact-store.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../store.js';

const TMP = mkdtempSync(path.join(tmpdir(), 'aiea-artifacts-'));
const store = new ArtifactStore(TMP);

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('ArtifactStore 二进制读写', () => {
  it('saveBinary 返回绝对路径且 readBinary 往返一致', () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    const fullPath = store.saveBinary('run-1', 'deck.pptx', buf);
    expect(path.isAbsolute(fullPath)).toBe(true);
    expect(fullPath.endsWith(path.join('run-1', 'deck.pptx'))).toBe(true);
    expect(store.readBinary('run-1', 'deck.pptx')?.equals(buf)).toBe(true);
  });

  it('readBinary 文件不存在返回 undefined；getBaseDir 返回构造目录', () => {
    expect(store.readBinary('run-x', 'nope.pptx')).toBeUndefined();
    expect(store.getBaseDir()).toBe(TMP);
  });
});

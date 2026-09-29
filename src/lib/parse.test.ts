import { describe, it, expect } from 'vitest';
import { parseChannelList, formatChannelList } from './parse';

describe('parseChannelList', () => {
  it('解析逗号、空格、顿号、分号、换行混合分隔', () => {
    expect(parseChannelList('1, 2 3、4；5\n6，7').values).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('保留输入顺序（不在解析阶段排序）', () => {
    expect(parseChannelList('9, 2, 11').values).toEqual([9, 2, 11]);
  });
  it('空文本得到空集合', () => {
    expect(parseChannelList('   ').values).toEqual([]);
  });
  it('报告无法识别的词元', () => {
    const r = parseChannelList('1, x, 3.5, 4');
    expect(r.values).toEqual([1, 4]);
    expect(r.invalidTokens).toEqual(['x', '3.5']);
  });
  it('拒绝零与负数', () => {
    const r = parseChannelList('0, -1, 2');
    expect(r.values).toEqual([2]);
    expect(r.invalidTokens).toEqual(['0', '-1']);
  });
});

describe('formatChannelList', () => {
  it('以逗号连接', () => {
    expect(formatChannelList([1, 3, 7])).toBe('1, 3, 7');
  });
});

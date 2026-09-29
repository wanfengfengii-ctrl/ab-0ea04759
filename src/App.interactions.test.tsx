// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import App from './App';

const cellInputs = () =>
  screen
    .getAllByPlaceholderText('如 1, 3, 7')
    .map((el) => el as HTMLInputElement);

const typeInto = (el: HTMLInputElement, value: string) => {
  fireEvent.change(el, { target: { value } });
};

/** 在第 idx 行（0 基）切换预期/实测二值按钮 */
const setBit = (rowIdx: number, which: 'expected' | 'observed', value: 0 | 1) => {
  const groups = screen.getAllByRole('group');
  // 每行两个 group：预期在前、实测在后
  const group = groups[rowIdx * 2 + (which === 'expected' ? 0 : 1)];
  fireEvent.click(within(group).getByText(String(value), { selector: 'button' }));
};

beforeEach(() => {
  render(<App />);
});

afterEach(() => {
  cleanup();
});

describe('App 交互流程', () => {
  it('提交诊断：显示故障名单、第二见证与逐记录推导', () => {
    // 初始载入的示例数据直接提交
    fireEvent.click(screen.getByText('提交诊断'));

    expect(screen.getByText('联合归因故障通道')).toBeTruthy();
    // 示例真值 [1,7,10]
    const chips = screen
      .getAllByText(/^\d+$/)
      .map((e) => e.textContent);
    expect(chips).not.toBeNull();
    expect(document.body.textContent).toContain('第二份见证');
    expect(document.body.textContent).toContain('首个分歧通道为第 10 号');
    expect(document.body.textContent).toContain('✓ 奇偶一致，解释差异');
  });

  it('修改草稿立即撤销旧诊断名单', () => {
    fireEvent.click(screen.getByText('提交诊断'));
    expect(screen.getByText('联合归因故障通道')).toBeTruthy();

    // 改第一行通道集合
    typeInto(cellInputs()[0], '1, 2, 3, 4');

    // 名单消失，出现撤销提示
    expect(screen.queryByText('联合归因故障通道')).toBeNull();
    expect(screen.getByText(/上一次诊断的故障名单已立即撤销/)).toBeTruthy();
  });

  it('矛盾数据明确显示无联合归因结论且不保留旧名单', () => {
    fireEvent.click(screen.getByText('清空'));
    const inputs = cellInputs();
    // 需要 6 条记录：构造矛盾奇偶系统
    const data: Array<[string, 0 | 1, 0 | 1]> = [
      ['1, 2', 0, 1],
      ['2, 3', 0, 1],
      ['1, 3', 0, 1],
      ['4, 5', 0, 0],
      ['5, 6', 0, 0],
      ['4, 6', 0, 0],
    ];
    data.forEach(([chs, e, o], i) => {
      typeInto(inputs[i], chs);
      if (e === 1) setBit(i, 'expected', 1);
      if (o === 1) setBit(i, 'observed', 1);
    });

    fireEvent.click(screen.getByText('提交诊断'));
    expect(screen.getByText('无联合归因结论。')).toBeTruthy();
    expect(document.body.textContent).toContain('不存在任何一个故障通道集合');
    expect(screen.queryByText('联合归因故障通道')).toBeNull();

    // 修改草稿后 UNSAT 提示也被撤销
    typeInto(cellInputs()[0], '1, 2, 8');
    expect(screen.queryByText('无联合归因结论。')).toBeNull();
  });

  it('空通道集合等非法输入被拦截且不产生诊断', () => {
    fireEvent.click(screen.getByText('提交诊断')); // 示例正常
    fireEvent.click(screen.getByText('清空'));
    fireEvent.click(screen.getByText('提交诊断')); // 全空
    expect(screen.getByText(/输入有误，未进行诊断/)).toBeTruthy();
    expect(screen.getAllByText(/通道集合必须非空/).length).toBeGreaterThan(0);
    expect(screen.queryByText('联合归因故障通道')).toBeNull();
  });
});

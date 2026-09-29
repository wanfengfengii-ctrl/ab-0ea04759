// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

function submit() {
  fireEvent.click(screen.getByRole('button', { name: '提交诊断' }));
}

describe('App 页面交互', () => {
  it('提交样例：展示故障通道、第二见证、分歧通道与逐条结论', () => {
    const { container } = render(<App />);
    submit();

    expect(screen.getByText('故障通道（联合最优方案）')).toBeTruthy();
    const faultChips = container.querySelectorAll('.chip.fault');
    expect([...faultChips].map((el) => el.textContent)).toEqual(['1', '8']);

    const witnessChips = container.querySelectorAll('.chip.witness');
    expect([...witnessChips].map((el) => el.textContent)).toEqual(['2', '7']);
    expect(screen.getByText(/首个分歧通道为/).textContent).toContain('通道 1');

    // 6 条记录全部被解释
    expect(container.querySelectorAll('.tag.ok')).toHaveLength(6);
    // 推导行给出故障数与奇偶
    expect(screen.getAllByText('奇（1）').length).toBeGreaterThan(0);
  });

  it('修改草稿立即撤销旧诊断，不保留旧名单', () => {
    const { container } = render(<App />);
    submit();
    expect(container.querySelectorAll('.chip.fault').length).toBeGreaterThan(0);

    // 修改第一条记录的通道集合
    const channelInputs = screen.getAllByPlaceholderText('如 1, 3, 7');
    fireEvent.change(channelInputs[0], { target: { value: '1, 2' } });

    expect(screen.queryByText('诊断结论')).toBeNull();
    expect(container.querySelectorAll('.chip.fault')).toHaveLength(0);
    expect(screen.queryByText('当前诊断基于最近一次提交')).toBeNull();
  });

  it('无联合解时明确显示无结论且不保留旧名单', () => {
    const { container } = render(<App />);
    submit();
    expect(container.querySelectorAll('.chip.fault').length).toBeGreaterThan(0);

    // 将所有记录改为针对同一集合 {1,2}：第 1 行 0/1 要求奇；
    // 第 2 行初始 1/0 也是奇，把其预期改为 0 得 0/0 要求偶，形成矛盾
    const channelInputs = screen.getAllByPlaceholderText('如 1, 3, 7');
    channelInputs.forEach((input) => fireEvent.change(input, { target: { value: '1, 2' } }));
    const selects = container.querySelectorAll('.bit-select');
    fireEvent.change(selects[2], { target: { value: '0' } });

    submit();

    expect(screen.getByRole('alert').textContent).toContain('无联合归因结论');
    expect(screen.queryByText('故障通道（联合最优方案）')).toBeNull();
    expect(container.querySelectorAll('.chip.fault')).toHaveLength(0);
    expect(screen.getByText(/不存在能同时解释全部 6 条校验记录/)).toBeTruthy();
  });

  it('校验记录不足时阻止诊断并给出错误', () => {
    render(<App />);
    const removeButtons = screen.getAllByRole('button', { name: '删除' });
    fireEvent.click(removeButtons[0]); // 6 -> 5
    submit();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('校验记录须在 6–24 条之间');
  });

  it('记录引用不存在的通道时阻止诊断', () => {
    render(<App />);
    const channelInputs = screen.getAllByPlaceholderText('如 1, 3, 7');
    fireEvent.change(channelInputs[0], { target: { value: '99, 100' } });
    submit();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('通道 99 不在已录入的通道表中');
  });
});

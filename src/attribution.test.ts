import { describe, expect, it } from 'vitest';
import { diagnose, type CheckRecord, type DiagnosisInput } from './attribution';

function rec(id: string, channels: number[], expected: 0 | 1, measured: 0 | 1): CheckRecord {
  return { id, channels, expected, measured };
}

function input(channels: number[], records: CheckRecord[]): DiagnosisInput {
  return { channels, records };
}

describe('diagnose 联合奇偶归因', () => {
  it('单记录：唯一的最小解释是集合内编号最小的通道', () => {
    // 记录 {2,5,9} 预期0实测1 -> 奇数个故障，最小字典序方案为 {2}
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [rec('r1', [2, 5, 9], 0, 1)]
      )
    );
    expect(r.solvable).toBe(true);
    expect(r.primary!.faults).toEqual([2]);
    expect(r.second!.faults).toEqual([5]); // 下一字典序最小解
    expect(r.firstDivergentChannel).toBe(2);
    expect(r.minimumSolutionCount).toBe(3); // {2},{5},{9}
  });

  it('多记录联合归因：禁止按单条记录各自独立猜测', () => {
    // r1: {1,2} 奇；r2: {2,3} 奇；r3: {1,2,3} 偶
    // 任何单通道都无法同时满足三条：
    //   通道1 -> r2 为偶 ✗；通道2 -> r3 为奇 ✗；通道3 -> r1 为偶 ✗
    // 唯一联合最优解是 {1,3}（权2）。逐条独立归因只会得到彼此冲突的猜测。
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [
          rec('r1', [1, 2], 0, 1),
          rec('r2', [2, 3], 1, 0),
          rec('r3', [1, 2, 3], 0, 0),
        ]
      )
    );
    expect(r.solvable).toBe(true);
    expect(r.primary!.faults).toEqual([1, 3]);
    expect(r.second).toBeNull(); // 最小解唯一
    expect(r.firstDivergentChannel).toBeNull();
    expect(r.minimumSolutionCount).toBe(1);
    expect(r.conclusions).toHaveLength(3);
    for (const c of r.conclusions) expect(c.explained).toBe(true);
  });

  it('单条记录看似归因于多个通道时，联合求解可收敛为单一公共通道', () => {
    // x1⊕x2=1, x2⊕x3=1 -> {2} 同时解释两条（权1，唯一最优），
    // 而逐条独立猜测可能给出 {1} 与 {3} 两份冲突名单。
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [
          rec('r1', [1, 2], 0, 1),
          rec('r2', [2, 3], 1, 0),
        ]
      )
    );
    expect(r.solvable).toBe(true);
    expect(r.primary!.faults).toEqual([2]);
    expect(r.second).toBeNull();
    expect(r.firstDivergentChannel).toBeNull();
    expect(r.minimumSolutionCount).toBe(1);
  });

  it('预期等于实测时要求集合内故障数为偶（含 0）', () => {
    // {1,2,3} 预期=实测，要求偶；无故障即为唯一最优
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [rec('r1', [1, 2, 3], 1, 1)]
      )
    );
    expect(r.primary!.faults).toEqual([]);
    expect(r.second).toBeNull();
    expect(r.minimumSolutionCount).toBe(1);
    expect(r.conclusions[0].faultCountInSet).toBe(0);
    expect(r.conclusions[0].parity).toBe(0);
    expect(r.conclusions[0].requiredParity).toBe(0);
    expect(r.conclusions[0].explained).toBe(true);
  });

  it('不存在联合解时明确判定无解', () => {
    // r1: {1,2} 奇；r2: {1,2} 偶 —— 同一集合矛盾
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [
          rec('r1', [1, 2], 0, 1),
          rec('r2', [1, 2], 0, 0),
        ]
      )
    );
    expect(r.solvable).toBe(false);
    expect(r.primary).toBeNull();
    expect(r.second).toBeNull();
    expect(r.minimumSolutionCount).toBe(0);
  });

  it('字典序：先比故障数，再比编号序列', () => {
    // {2,4} 奇：单故障解 {2},{4}，首选 {2}
    // 再加 {3,4} 奇：联立 x2⊕x4=1, x3⊕x4=1 -> {2,3} 或 {4}
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [
          rec('r1', [2, 4], 0, 1),
          rec('r2', [3, 4], 0, 1),
        ]
      )
    );
    expect(r.primary!.faults).toEqual([4]); // 权1 小于 {2,3} 的权2
    expect(r.second).toBeNull();
  });

  it('第二见证与首个分歧通道：多个等优最小解', () => {
    // 仅约束 {1,2,3,4} 奇：最小权 1，候选 {1},{2},{3},{4}
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [rec('r1', [1, 2, 3, 4], 1, 0)]
      )
    );
    expect(r.primary!.faults).toEqual([1]);
    expect(r.second!.faults).toEqual([2]);
    expect(r.firstDivergentChannel).toBe(1);
    expect(r.minimumSolutionCount).toBe(4);
  });

  it('30 通道规模下自由变量枚举仍然正确且快速', () => {
    const channels = Array.from({ length: 30 }, (_, i) => i + 1);
    // 6 条独立约束，24 个自由变量 -> 1600 万枚举（Gray 码应秒级完成）
    const records: CheckRecord[] = [];
    for (let k = 0; k < 6; k++) {
      records.push(rec(`r${k}`, [k * 4 + 1, k * 4 + 2, k * 4 + 3, k * 4 + 4], 0, 1));
    }
    const start = Date.now();
    const r = diagnose(input(channels, records));
    const elapsed = Date.now() - start;
    expect(r.solvable).toBe(true);
    // 每组 4 选 1 个故障，字典序首选每组第一个
    expect(r.primary!.faults).toEqual([1, 5, 9, 13, 17, 21]);
    expect(r.second!.faults).toEqual([1, 5, 9, 13, 17, 22]);
    expect(r.firstDivergentChannel).toBe(21);
    expect(r.minimumSolutionCount).toBe(4 ** 6);
    expect(elapsed).toBeLessThan(10000);
  });

  it('每条结论给出推导故障数、奇偶与是否解释差异', () => {
    const r = diagnose(
      input(
        [1, 2, 3, 4, 5, 6, 7, 8],
        [
          rec('r1', [1, 2, 3], 0, 1),
          rec('r2', [3, 4, 5], 0, 1),
        ]
      )
    );
    // x1⊕x2⊕x3=1, x3⊕x4⊕x5=1；权1 解 x3=1 -> {3}
    expect(r.primary!.faults).toEqual([3]);
    const [c1, c2] = r.conclusions;
    expect(c1.faultCountInSet).toBe(1);
    expect(c1.parity).toBe(1);
    expect(c1.requiredParity).toBe(1);
    expect(c1.explained).toBe(true);
    expect(c2.faultCountInSet).toBe(1);
    expect(c2.explained).toBe(true);
  });

  it('通道乱序输入仍按编号排列处理', () => {
    const r = diagnose(
      input(
        [8, 3, 1, 6, 2, 5, 4, 7],
        [rec('r1', [3, 1, 2], 0, 1)]
      )
    );
    expect(r.primary!.faults).toEqual([1]);
    expect(r.second!.faults).toEqual([2]);
  });

  it('空故障集合合法时它是唯一的权0最优解，无第二见证', () => {
    // {1,2} 要求偶：解为 {}（权0）或 {1,2}（权2）
    const r = diagnose(
      input([1, 2, 3, 4, 5, 6, 7, 8], [rec('r1', [1, 2], 0, 0)])
    );
    expect(r.primary!.faults).toEqual([]);
    expect(r.second).toBeNull();
    expect(r.firstDivergentChannel).toBeNull();
    expect(r.minimumSolutionCount).toBe(1);
  });
});

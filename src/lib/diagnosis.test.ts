import { describe, it, expect } from 'vitest';
import { diagnose, validateInput, type CheckRecord, type Bit } from './diagnosis';

const rec = (channels: number[], expected: Bit, observed: Bit): CheckRecord => ({
  channels,
  expected,
  observed,
});

/** 2^n 暴力枚举，作为求解器的对照基准 */
function bruteForce(n: number, records: CheckRecord[]) {
  const rows = records.map((r) => {
    let mask = 0;
    for (const c of r.channels) mask |= 1 << (c - 1);
    return { mask, rhs: r.expected ^ r.observed };
  });
  const pop = (x: number) => {
    let c = 0;
    while (x) {
      x &= x - 1;
      c++;
    }
    return c;
  };
  const satisfies = (x: number) =>
    rows.every(({ mask, rhs }) => (pop(x & mask) & 1) === rhs);
  const toList = (x: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if ((x >>> i) & 1) out.push(i + 1);
    return out;
  };
  const all: number[] = [];
  for (let x = 0; x < 1 << n; x++) if (satisfies(x)) all.push(x);
  if (all.length === 0) return null;
  const lexArr = (a: number[], b: number[]) => {
    const L = Math.min(a.length, b.length);
    for (let i = 0; i < L; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  };
  all.sort((a, b) => pop(a) - pop(b) || lexArr(toList(a), toList(b)));
  const minW = pop(all[0]);
  const mins = all.filter((x) => pop(x) === minW);
  return { best: all[0], second: mins.length > 1 ? mins[1] : null, count: all.length };
}

// 简易确定性伪随机
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('validateInput', () => {
  it('接受合法输入', () => {
    expect(validateInput(8, [rec([1, 2], 0, 1)])).toEqual([]);
  });
  it('拒绝空通道集合', () => {
    expect(validateInput(8, [rec([], 0, 0)])).not.toEqual([]);
  });
  it('拒绝越界编号与集合内重复', () => {
    expect(validateInput(8, [rec([0, 9], 0, 0)])).toHaveLength(1);
    expect(validateInput(8, [rec([1, 1], 0, 0)])).toHaveLength(1);
  });
  it('非法二值报错', () => {
    const r = { channels: [1], expected: 2 as unknown as Bit, observed: 0 as Bit };
    expect(validateInput(8, [r])).toHaveLength(1);
  });
});

describe('diagnose — 唯一最小解', () => {
  const n = 8;
  // 故障真相 {3, 5}
  const records = [
    rec([1, 2, 3], 0, 1),
    rec([3, 4], 0, 1),
    rec([5, 6], 1, 0),
    rec([6, 7], 0, 0),
    rec([1, 2], 1, 1),
    rec([7, 8], 1, 1),
  ];
  const r = diagnose(n, records);
  it('定位 {3,5} 且唯一', () => {
    expect(r.status).toBe('sat');
    if (r.status !== 'sat') return;
    expect(r.faulty).toEqual([3, 5]);
    expect(r.faultyCount).toBe(2);
    expect(r.unique).toBe(true);
    expect(r.witness).toBeNull();
    expect(r.firstDivergingChannel).toBeNull();
  });
  it('每条记录推导奇偶均解释差异', () => {
    if (r.status !== 'sat') return;
    expect(r.derivations).toHaveLength(6);
    for (const d of r.derivations) {
      expect(d.faultyParity).toBe(d.discrepancy);
      expect(d.explained).toBe(true);
    }
  });
});

describe('diagnose — 最小方案不唯一的第二见证与首个分歧通道', () => {
  const n = 8;
  // 约束使单点解仅可能落在 5..8：{5},{6},{7},{8} 同重量
  const records = [
    rec([1, 2, 3, 4, 5, 6, 7, 8], 0, 1),
    rec([1, 2], 0, 0),
    rec([1, 3], 0, 0),
    rec([2, 4], 0, 0),
    rec([3, 4], 0, 0),
    rec([1, 4], 0, 0),
  ];
  const r = diagnose(n, records);
  it('序列字典序最小为 [5]，第二见证为 [6]，分歧通道 5', () => {
    expect(r.status).toBe('sat');
    if (r.status !== 'sat') return;
    expect(r.faulty).toEqual([5]);
    expect(r.unique).toBe(false);
    expect(r.witness).toEqual([6]);
    expect(r.firstDivergingChannel).toBe(5);
  });
});

describe('diagnose — 矛盾系统返回 unsat', () => {
  const n = 8;
  const records = [
    rec([1, 2], 0, 1),
    rec([2, 3], 0, 1),
    rec([1, 3], 0, 1), // 前两条推出 x1⊕x3=0，与 RHS 1 矛盾
    rec([4, 5], 0, 0),
    rec([5, 6], 0, 0),
    rec([4, 6], 0, 0),
  ];
  it('报告无联合归因结论', () => {
    const r = diagnose(n, records);
    expect(r.status).toBe('unsat');
  });
});

describe('diagnose — 与暴力枚举的随机对照', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rand = mulberry32(seed * 7919 + 13);
    const n = 6 + Math.floor(rand() * 9); // 6..14
    const m = 6 + Math.floor(rand() * 8); // 6..13
    // 先随机挑选“真相”故障集合，再生成其能解释的记录
    const truth = Math.floor(rand() * (1 << n));
    const pop = (x: number) => {
      let c = 0;
      let y = x;
      while (y) {
        y &= y - 1;
        c++;
      }
      return c;
    };
    const records: CheckRecord[] = [];
    for (let i = 0; i < m; i++) {
      let mask = 0;
      while (mask === 0) {
        mask = 0;
        for (let c = 0; c < n; c++) if (rand() < 0.35) mask |= 1 << c;
      }
      const parity = pop(truth & mask) & 1;
      // expected 任选，observed = expected XOR parity
      const expected = (rand() < 0.5 ? 0 : 1) as Bit;
      records.push(rec(
        Array.from({ length: n }, (_, c) => c + 1).filter((c) => (mask >>> (c - 1)) & 1),
        expected,
        (expected ^ parity) as Bit,
      ));
    }
    it(`seed=${seed} n=${n} m=${m}`, () => {
      const r = diagnose(n, records);
      const b = bruteForce(n, records);
      expect(b).not.toBeNull(); // 由真相保证必然相容
      if (!b || r.status !== 'sat') return;
      expect(r.faulty).toEqual((() => {
        const out: number[] = [];
        for (let i = 0; i < n; i++) if ((b.best >>> i) & 1) out.push(i + 1);
        return out;
      })());
      expect(r.faultyCount).toBe(pop(b.best));
      if (b.second === null) {
        expect(r.unique).toBe(true);
        expect(r.witness).toBeNull();
      } else {
        expect(r.unique).toBe(false);
        const wl: number[] = [];
        for (let i = 0; i < n; i++) if ((b.second >>> i) & 1) wl.push(i + 1);
        expect(r.witness).toEqual(wl);
        expect(r.firstDivergingChannel).toBe(ctzLocal(b.best ^ b.second) + 1);
      }
    });
  }
});

function ctzLocal(x: number) {
  let i = 0;
  while (((x >>> i) & 1) === 0) i++;
  return i;
}

describe('diagnose — 直接构造含矛盾的随机实例同样由暴力枚举校验', () => {
  for (let seed = 100; seed <= 130; seed++) {
    const rand = mulberry32(seed * 104729 + 7);
    const n = 6 + Math.floor(rand() * 9);
    const m = 6 + Math.floor(rand() * 8);
    const records: CheckRecord[] = [];
    for (let i = 0; i < m; i++) {
      let mask = 0;
      while (mask === 0) {
        mask = 0;
        for (let c = 0; c < n; c++) if (rand() < 0.4) mask |= 1 << c;
      }
      const expected = (rand() < 0.5 ? 0 : 1) as Bit;
      const observed = (rand() < 0.5 ? 0 : 1) as Bit;
      records.push(rec(
        Array.from({ length: n }, (_, c) => c + 1).filter((c) => (mask >>> (c - 1)) & 1),
        expected,
        observed,
      ));
    }
    it(`seed=${seed} n=${n} m=${m}`, () => {
      const r = diagnose(n, records);
      const b = bruteForce(n, records);
      if (b === null) {
        expect(r.status).toBe('unsat');
      } else {
        expect(r.status).toBe('sat');
        if (r.status !== 'sat') return;
        const bl: number[] = [];
        for (let i = 0; i < n; i++) if ((b.best >>> i) & 1) bl.push(i + 1);
        expect(r.faulty).toEqual(bl);
      }
    });
  }
});

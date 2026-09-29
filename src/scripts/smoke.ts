/**
 * 归因模块冒烟：以独立进程执行若干关键断言，全部通过退出码 0，否则 1。
 * 供 compose 的 verify 一次性服务在测试与构建之后运行。
 */
import { diagnose, type CheckRecord, type DiagnosisInput } from '../attribution';

let failures = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? '');
  }
}

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

console.log('smoke: 联合奇偶归因');

// 1) 有联合解：{1,2} 奇、{2,3} 奇 -> {2}
const ok: DiagnosisInput = {
  channels: [1, 2, 3, 4, 5, 6, 7, 8],
  records: [
    { id: 'r1', channels: [1, 2], expected: 0, measured: 1 },
    { id: 'r2', channels: [2, 3], expected: 1, measured: 0 },
  ],
};
const r1 = diagnose(ok);
check('可解场景 solvable=true', r1.solvable === true);
check('主方案为 {2}', eq(r1.primary?.faults, [2]), r1.primary?.faults);
check('每条记录均被解释', r1.conclusions.every((c) => c.explained));

// 2) 等优多解：{1,2,3,4} 奇 -> 主 {1}，第二见证 {2}，分歧通道 1
const multi: DiagnosisInput = {
  channels: [1, 2, 3, 4, 5, 6, 7, 8],
  records: [{ id: 'r1', channels: [1, 2, 3, 4], expected: 0, measured: 1 }],
};
const r2 = diagnose(multi);
check('多解主方案字典序最小 {1}', eq(r2.primary?.faults, [1]));
check('第二份见证为 {2}', eq(r2.second?.faults, [2]));
check('首个分歧通道为 1', r2.firstDivergentChannel === 1);
check('最小方案数量为 4', r2.minimumSolutionCount === 4, r2.minimumSolutionCount);

// 3) 无联合解：同一集合奇偶矛盾
const bad: DiagnosisInput = {
  channels: [1, 2, 3, 4, 5, 6, 7, 8],
  records: [
    { id: 'r1', channels: [1, 2], expected: 0, measured: 1 },
    { id: 'r2', channels: [1, 2], expected: 0, measured: 0 },
  ],
};
const r3 = diagnose(bad);
check('矛盾记录 solvable=false', r3.solvable === false);
check('无解时不产生故障名单', r3.primary === null && r3.second === null);

// 4) 推导奇偶与结论明细
check(
  '结论含推导故障数/奇偶/要求奇偶',
  r1.conclusions[0].faultCountInSet === 1 &&
    r1.conclusions[0].parity === 1 &&
    r1.conclusions[0].requiredParity === 1
);

// 5) 输入规模边界：30 通道 24 记录也能完成
const big: DiagnosisInput = {
  channels: Array.from({ length: 30 }, (_, i) => i + 1),
  records: Array.from({ length: 24 }, (_, i): CheckRecord => ({
    id: `r${i}`,
    channels: [(i % 30) + 1, ((i + 7) % 30) + 1],
    expected: (i % 2) as 0 | 1,
    measured: 0,
  })),
};
const r5 = diagnose(big);
check('30 通道/24 记录诊断完成', typeof r5.solvable === 'boolean');

if (failures > 0) {
  console.error(`smoke: ${failures} 项断言失败`);
  process.exit(1);
}
console.log('smoke: 全部通过');

/**
 * 归因模块冒烟脚本：以三类典型场景端到端调用 diagnose，
 * 任一断言失败即以非零退出码报告（供 Compose 的 verify 一次性服务使用）。
 */
import { diagnose, type CheckRecord } from '../src/lib/diagnosis';

let failures = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, detail ?? '');
  }
};

console.log('场景 1：唯一最小故障集合');
{
  const records: CheckRecord[] = [
    { channels: [1, 2, 3], expected: 0, observed: 1 },
    { channels: [3, 4], expected: 0, observed: 1 },
    { channels: [5, 6], expected: 1, observed: 0 },
    { channels: [6, 7], expected: 0, observed: 0 },
    { channels: [1, 2], expected: 1, observed: 1 },
    { channels: [7, 8], expected: 1, observed: 1 },
  ];
  const r = diagnose(8, records);
  check('状态为 sat', r.status === 'sat');
  if (r.status === 'sat') {
    check('故障通道为 [3,5]', JSON.stringify(r.faulty) === '[3,5]', r.faulty);
    check('故障数为 2', r.faultyCount === 2);
    check('方案唯一', r.unique === true && r.witness === null);
    check('每条记录推导奇偶均解释差异', r.derivations.every((d) => d.explained));
  }
}

console.log('场景 2：最小方案不唯一，给出第二见证与首个分歧通道');
{
  const records: CheckRecord[] = [
    { channels: [1, 2, 3, 4, 5, 6, 7, 8], expected: 0, observed: 1 },
    { channels: [1, 2], expected: 0, observed: 0 },
    { channels: [1, 3], expected: 0, observed: 0 },
    { channels: [2, 4], expected: 0, observed: 0 },
    { channels: [3, 4], expected: 0, observed: 0 },
    { channels: [1, 4], expected: 0, observed: 0 },
  ];
  const r = diagnose(8, records);
  check('状态为 sat', r.status === 'sat');
  if (r.status === 'sat') {
    check('字典序最小方案为 [5]', JSON.stringify(r.faulty) === '[5]', r.faulty);
    check('第二见证为 [6]', JSON.stringify(r.witness) === '[6]', r.witness);
    check('首个分歧通道为 5', r.firstDivergingChannel === 5, r.firstDivergingChannel);
  }
}

console.log('场景 3：方程组矛盾，无联合归因结论');
{
  const records: CheckRecord[] = [
    { channels: [1, 2], expected: 0, observed: 1 },
    { channels: [2, 3], expected: 0, observed: 1 },
    { channels: [1, 3], expected: 0, observed: 1 },
    { channels: [4, 5], expected: 0, observed: 0 },
    { channels: [5, 6], expected: 0, observed: 0 },
    { channels: [4, 6], expected: 0, observed: 0 },
  ];
  const r = diagnose(8, records);
  check('状态为 unsat', r.status === 'unsat', r);
}

if (failures > 0) {
  console.error(`\n归因冒烟失败：${failures} 项断言未通过`);
  process.exit(1);
}
console.log('\n归因模块冒烟全部通过。');

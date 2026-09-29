import { useMemo, useState } from 'react';
import {
  diagnose,
  type CheckRecord,
  type DiagnosisResult,
} from './attribution';

interface RecordDraft {
  id: string;
  channelText: string;
  expected: 0 | 1;
  measured: 0 | 1;
}

const MIN_CHANNELS = 8;
const MAX_CHANNELS = 30;
const MIN_RECORDS = 6;
const MAX_RECORDS = 24;

/** 解析通道编号文本：逗号、空格、顿号、分号、换行均可分隔 */
function parseChannelText(text: string): number[] {
  return text
    .split(/[\s,，、;；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s));
}

function parseChannels(text: string): { channels: number[]; error: string | null } {
  const nums = parseChannelText(text);
  if (nums.some((n) => !Number.isInteger(n) || n <= 0)) {
    return { channels: [], error: '通道编号必须为正整数' };
  }
  const dedup = new Set<number>();
  for (const n of nums) {
    if (dedup.has(n)) return { channels: [], error: `通道编号 ${n} 重复` };
    dedup.add(n);
  }
  return { channels: [...dedup].sort((a, b) => a - b), error: null };
}

function sampleRecords(): RecordDraft[] {
  // 该样例存在两个等优最小方案：主方案 {1,8}，第二见证 {2,7}，首个分歧通道 1
  const rows: Array<[string, 0 | 1, 0 | 1]> = [
    ['1, 2, 3', 0, 1],
    ['6, 7, 8', 1, 0],
    ['3, 4, 5', 0, 0],
    ['2, 7, 9', 0, 0],
    ['1, 8, 10', 1, 1],
    ['4, 5, 9', 0, 0],
  ];
  return rows.map(([channelText, expected, measured], i) => ({
    id: `r${i + 1}`,
    channelText,
    expected,
    measured,
  }));
}

let recordSeq = 100;

export default function App() {
  const [channelText, setChannelText] = useState(
    Array.from({ length: 10 }, (_, i) => i + 1).join(', ')
  );
  const [records, setRecords] = useState<RecordDraft[]>(sampleRecords);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const parsedChannels = useMemo(() => parseChannels(channelText), [channelText]);

  /** 任何草稿修改都立即撤销旧诊断，避免展示与当前输入不符的旧名单 */
  const invalidate = () => setResult(null);

  const updateChannelText = (v: string) => {
    setChannelText(v);
    invalidate();
  };

  const updateRecord = (id: string, patch: Partial<RecordDraft>) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    invalidate();
  };

  const addRecord = () => {
    if (records.length >= MAX_RECORDS) return;
    setRecords((rs) => [
      ...rs,
      { id: `new-${recordSeq++}`, channelText: '', expected: 0, measured: 0 },
    ]);
    invalidate();
  };

  const removeRecord = (id: string) => {
    setRecords((rs) => rs.filter((r) => r.id !== id));
    invalidate();
  };

  const runDiagnosis = () => {
    const errors: string[] = [];

    const { channels, error: chErr } = parsedChannels;
    if (chErr) {
      errors.push(`通道列表：${chErr}`);
    } else if (channels.length < MIN_CHANNELS || channels.length > MAX_CHANNELS) {
      errors.push(`通道数量须在 ${MIN_CHANNELS}–${MAX_CHANNELS} 之间，当前为 ${channels.length}`);
    }

    if (records.length < MIN_RECORDS || records.length > MAX_RECORDS) {
      errors.push(`校验记录须在 ${MIN_RECORDS}–${MAX_RECORDS} 条之间，当前为 ${records.length}`);
    }

    const channelSet = new Set(channels);
    const validRecords: CheckRecord[] = [];
    records.forEach((draft, i) => {
      const nums = parseChannelText(draft.channelText);
      const label = `第 ${i + 1} 条记录`;
      if (nums.length === 0) {
        errors.push(`${label}：通道集合不能为空`);
        return;
      }
      if (nums.some((n) => !Number.isInteger(n) || n <= 0)) {
        errors.push(`${label}：存在非法通道编号`);
        return;
      }
      const dup = nums.find((n, idx) => nums.indexOf(n) !== idx);
      if (dup !== undefined) {
        errors.push(`${label}：通道 ${dup} 在集合内重复`);
        return;
      }
      const unknown = nums.find((n) => !channelSet.has(n));
      if (unknown !== undefined) {
        errors.push(`${label}：通道 ${unknown} 不在已录入的通道表中`);
        return;
      }
      validRecords.push({
        id: draft.id,
        channels: nums,
        expected: draft.expected,
        measured: draft.measured,
      });
    });

    setFormErrors(errors);
    if (errors.length > 0) {
      setResult(null);
      return;
    }
    setResult(diagnose({ channels, records: validRecords }));
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>海底长期观测阵列 · 翻转通道联合归因</h1>
        <p className="subtitle">
          在本机联合选择同一个故障通道集合，使每条校验记录中故障通道数的奇偶性
          恰好解释预期值与实测值的差异；依次取故障数最少、通道编号序列字典序最小的方案。
        </p>
      </header>

      <section className="card">
        <h2>通道表（{MIN_CHANNELS}–{MAX_CHANNELS} 个，按编号排列）</h2>
        <textarea
          className="channel-input"
          rows={2}
          value={channelText}
          onChange={(e) => updateChannelText(e.target.value)}
          placeholder="例如：1, 2, 3, …, 12（逗号或空格分隔）"
        />
        <div className="hint">
          {parsedChannels.error ? (
            <span className="error-text">{parsedChannels.error}</span>
          ) : (
            <span>已解析 {parsedChannels.channels.length} 个通道</span>
          )}
        </div>
        <div className="chip-row">
          {parsedChannels.error === null &&
            parsedChannels.channels.map((ch) => <span key={ch} className="chip">{ch}</span>)}
        </div>
      </section>

      <section className="card">
        <div className="record-head">
          <h2>校验记录（{MIN_RECORDS}–{MAX_RECORDS} 条）</h2>
          <button type="button" className="btn secondary" onClick={addRecord}>
            ＋ 添加记录
          </button>
        </div>

        <div className="record-list">
          <div className="record-row record-row-head">
            <span className="col-idx">#</span>
            <span className="col-ch">非空通道集合</span>
            <span className="col-bit">预期</span>
            <span className="col-bit">实测</span>
            <span className="col-op" />
          </div>
          {records.map((rec, i) => (
            <div className="record-row" key={rec.id}>
              <span className="col-idx">{i + 1}</span>
              <input
                className="col-ch input"
                value={rec.channelText}
                placeholder="如 1, 3, 7"
                onChange={(e) => updateRecord(rec.id, { channelText: e.target.value })}
              />
              <BitSelect
                value={rec.expected}
                onChange={(v) => updateRecord(rec.id, { expected: v })}
              />
              <BitSelect
                value={rec.measured}
                onChange={(v) => updateRecord(rec.id, { measured: v })}
              />
              <span className="col-op">
                <button
                  type="button"
                  className="btn ghost danger"
                  onClick={() => removeRecord(rec.id)}
                  disabled={records.length <= 1}
                  title="删除该记录"
                >
                  删除
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="actions">
          <button type="button" className="btn primary" onClick={runDiagnosis}>
            提交诊断
          </button>
          {result && <span className="stale-hint">当前诊断基于最近一次提交</span>}
        </div>

        {formErrors.length > 0 && (
          <div className="alert error" role="alert">
            <strong>输入存在问题，未执行诊断：</strong>
            <ul>
              {formErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {result && <ResultPanel result={result} />}
    </main>
  );
}

function BitSelect({ value, onChange }: { value: 0 | 1; onChange: (v: 0 | 1) => void }) {
  return (
    <select className="col-bit input bit-select" value={value} onChange={(e) => onChange(Number(e.target.value) as 0 | 1)}>
      <option value={0}>0</option>
      <option value={1}>1</option>
    </select>
  );
}

function parityLabel(p: 0 | 1): string {
  return p === 1 ? '奇（1）' : '偶（0）';
}

function ResultPanel({ result }: { result: DiagnosisResult }) {
  if (!result.solvable) {
    return (
      <section className="card result" aria-live="polite">
        <div className="alert fatal" role="alert">
          <h2>无联合归因结论</h2>
          <p>
            不存在能同时解释全部 {result.recordCount} 条校验记录的故障通道集合——各记录的奇偶约束互相矛盾，
            系统已放弃旧的故障名单，请勿按单条记录分别猜测故障。
          </p>
          <p className="hint">请核对通道集合与预期/实测录入后重新提交。</p>
        </div>
      </section>
    );
  }

  const faults = result.primary!.faults;

  return (
    <section className="card result" aria-live="polite">
      <h2>诊断结论</h2>

      <div className="verdict">
        <div className="fault-box">
          <h3>故障通道（联合最优方案）</h3>
          {faults.length === 0 ? (
            <p className="empty-verdict">无故障通道（空集合即为最优解释）</p>
          ) : (
            <div className="chip-row fault-chips">
              {faults.map((ch) => (
                <span key={ch} className="chip fault">{ch}</span>
              ))}
            </div>
          )}
          <p className="hint">
            故障数 {faults.length}；在所有能联合解释全部记录的集合中故障数最少，
            且编号序列字典序最小。
          </p>
        </div>

        <div className="witness-box">
          <h3>第二份见证</h3>
          {result.second ? (
            <>
              <div className="chip-row">
                {result.second.faults.map((ch) => (
                  <span key={ch} className="chip witness">{ch}</span>
                ))}
              </div>
              <p className="hint">
                最小故障数方案不唯一（共 {result.minimumSolutionCount} 个等优方案）；
                与主方案的首个分歧通道为
                <strong> 通道 {result.firstDivergentChannel}</strong>。
              </p>
            </>
          ) : (
            <p className="empty-verdict">
              最小方案唯一，无第二份见证（共 {result.minimumSolutionCount} 个等优方案）。
            </p>
          )}
        </div>
      </div>

      <h3>逐条记录推导</h3>
      <div className="table-wrap">
        <table className="conclusion-table">
          <thead>
            <tr>
              <th>#</th>
              <th>通道集合</th>
              <th>预期</th>
              <th>实测</th>
              <th>要求奇偶</th>
              <th>集合内故障通道</th>
              <th>故障数</th>
              <th>推导奇偶</th>
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {result.conclusions.map((c, i) => (
              <tr key={c.record.id} className={c.explained ? 'row-ok' : 'row-bad'}>
                <td>{i + 1}</td>
                <td className="mono">{c.record.channels.join(', ')}</td>
                <td>{c.record.expected}</td>
                <td>{c.record.measured}</td>
                <td>{parityLabel(c.requiredParity)}</td>
                <td className="mono">
                  {c.record.channels.filter((ch) => faults.includes(ch)).join(', ') || '—'}
                </td>
                <td>{c.faultCountInSet}</td>
                <td>{parityLabel(c.parity)}</td>
                <td>
                  {c.explained ? (
                    <span className="tag ok">已解释差异</span>
                  ) : (
                    <span className="tag bad">无法解释</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        “要求奇偶”由预期值 XOR 实测值决定：两值不同要求集合内故障数为奇数，相同要求为偶数。
        自由变量 {result.degreesOfFreedom} 个。
      </p>
    </section>
  );
}

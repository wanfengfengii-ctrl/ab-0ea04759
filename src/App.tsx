import { useMemo, useState } from 'react';
import {
  diagnose,
  validateInput,
  type Bit,
  type CheckRecord,
  type DiagnosisResult,
} from './lib/diagnosis';
import { parseChannelList } from './lib/parse';
import BitSelect from './components/BitSelect';
import ChannelChips from './components/ChannelChips';

interface DraftRow {
  id: number;
  channelsText: string;
  expected: Bit;
  observed: Bit;
}

const MIN_CHANNELS = 8;
const MAX_CHANNELS = 30;
const MIN_RECORDS = 6;
const MAX_RECORDS = 24;

let nextId = 1;
const newRow = (): DraftRow => ({ id: nextId++, channelsText: '', expected: 0, observed: 0 });

const EXAMPLE_CHANNELS = 12;
const EXAMPLE_ROWS: Array<[string, Bit, Bit]> = [
  ['1, 2, 3', 0, 1],
  ['3, 4, 5, 6, 7', 1, 0],
  ['7, 8, 9', 0, 1],
  ['10, 11, 12', 1, 0],
  ['2, 11', 0, 0],
  ['1, 4, 5, 8, 9, 10, 12', 1, 1],
  ['2, 3, 7, 11', 0, 1],
  ['1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12', 1, 0],
];

function makeExampleRows(): DraftRow[] {
  return EXAMPLE_ROWS.map(([channelsText, expected, observed]) => ({
    id: nextId++,
    channelsText,
    expected,
    observed,
  }));
}

function blankRows(count: number): DraftRow[] {
  return Array.from({ length: count }, newRow);
}

export default function App() {
  const [channelCount, setChannelCount] = useState<number>(EXAMPLE_CHANNELS);
  const [rows, setRows] = useState<DraftRow[]>(makeExampleRows);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [revokedSat, setRevokedSat] = useState(false);
  const [revokedUnsat, setRevokedUnsat] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  /**
   * 任何草稿变更都经此入口：立即撤销上一次诊断结果，避免修改后仍保留
   * 与当前草稿不符的旧结论或旧维修名单。
   */
  const mutate = (fn: () => void) => {
    if (result?.status === 'sat') setRevokedSat(true);
    if (result?.status === 'unsat') setRevokedUnsat(true);
    setResult(null);
    setErrors([]);
    fn();
  };

  const updateRow = (id: number, patch: Partial<DraftRow>) =>
    mutate(() => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))));

  const addRow = () =>
    mutate(() => setRows((rs) => (rs.length >= MAX_RECORDS ? rs : [...rs, newRow()])));

  const removeRow = (id: number) => mutate(() => setRows((rs) => rs.filter((r) => r.id !== id)));

  const resetBlank = () =>
    mutate(() => {
      setChannelCount(MIN_CHANNELS);
      setRows(blankRows(MIN_RECORDS));
    });

  const loadExample = () =>
    mutate(() => {
      setChannelCount(EXAMPLE_CHANNELS);
      setRows(makeExampleRows());
    });

  const changeChannelCount = (v: number) => mutate(() => setChannelCount(v));

  const submit = () => {
    const errs: string[] = [];
    if (!Number.isInteger(channelCount) || channelCount < MIN_CHANNELS || channelCount > MAX_CHANNELS) {
      errs.push(`通道总数须为 ${MIN_CHANNELS}–${MAX_CHANNELS} 之间的整数。`);
    }
    if (rows.length < MIN_RECORDS || rows.length > MAX_RECORDS) {
      errs.push(`校验记录须为 ${MIN_RECORDS}–${MAX_RECORDS} 条（当前 ${rows.length} 条）。`);
    }

    const records: CheckRecord[] = [];
    rows.forEach((row, i) => {
      const where = `第 ${i + 1} 条记录`;
      const parsed = parseChannelList(row.channelsText);
      if (parsed.invalidTokens.length > 0) {
        errs.push(`${where}：无法识别的编号 “${parsed.invalidTokens.join('、')}”。`);
      }
      if (parsed.values.length === 0) {
        errs.push(`${where}：通道集合必须非空。`);
        return;
      }
      if (new Set(parsed.values).size !== parsed.values.length) {
        errs.push(`${where}：通道集合内存在重复编号。`);
      }
      const outOfRange = parsed.values.filter((c) => c < 1 || c > channelCount);
      if (outOfRange.length > 0) {
        errs.push(`${where}：编号 ${outOfRange.join(', ')} 超出 1..${channelCount} 范围。`);
      }
      records.push({
        channels: parsed.values,
        expected: row.expected,
        observed: row.observed,
      });
    });

    if (errs.length === 0) errs.push(...validateInput(channelCount, records));

    if (errs.length > 0) {
      setErrors(errs);
      setResult(null);
      setRevokedSat(false);
      setRevokedUnsat(false);
      return;
    }

    // 仅在本机、浏览器内对全部记录做联合求解，不上传任何数据。
    const r = diagnose(channelCount, records);
    setResult(r);
    setRevokedSat(false);
    setRevokedUnsat(false);
    setErrors([]);
  };

  const faultySet = useMemo(
    () => (result?.status === 'sat' ? new Set(result.faulty) : null),
    [result],
  );

  return (
    <div className="page">
      <header className="masthead">
        <h1>海底长期观测阵列 · 采集通道翻转联合归因</h1>
        <p className="subtitle">
          在本机对全部校验记录进行 <strong>联合</strong> GF(2) 奇偶求解：挑选同一个故障通道集合，
          使每条记录中故障通道数的奇偶性恰好等于预期与实测的差异位；
          依次取故障数最少、通道编号序列字典序最小的方案。
          <strong> 不按单条记录独立归因</strong>，以免各轮校验给出彼此冲突的维修名单。
        </p>
      </header>

      <main className="layout">
        <section className="card" aria-label="校验数据录入">
          <div className="card-head">
            <h2>校验数据录入</h2>
            <div className="card-actions">
              <button type="button" className="btn" onClick={loadExample}>
                载入示例
              </button>
              <button type="button" className="btn" onClick={resetBlank}>
                清空
              </button>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="channel-count">按编号排列的通道总数</label>
            <input
              id="channel-count"
              type="number"
              min={MIN_CHANNELS}
              max={MAX_CHANNELS}
              value={Number.isFinite(channelCount) ? channelCount : ''}
              onChange={(e) => changeChannelCount(e.target.valueAsNumber || 0)}
            />
            <span className="hint">允许 {MIN_CHANNELS}–{MAX_CHANNELS} 个通道，编号 1..N</span>
          </div>

          <div className="table-wrap">
            <table className="record-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th className="col-ch">非空通道集合（编号）</th>
                  <th>预期</th>
                  <th>实测</th>
                  <th>差异位 e⊕o</th>
                  <th className="col-op" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id}>
                    <td className="col-idx">{i + 1}</td>
                    <td className="col-ch">
                      <input
                        type="text"
                        value={row.channelsText}
                        placeholder="如 1, 3, 7"
                        onChange={(e) => updateRow(row.id, { channelsText: e.target.value })}
                        aria-label={`第 ${i + 1} 条记录的通道集合`}
                      />
                    </td>
                    <td>
                      <BitSelect
                        value={row.expected}
                        onChange={(v) => updateRow(row.id, { expected: v })}
                        ariaLabel={`第 ${i + 1} 条记录的预期二值`}
                      />
                    </td>
                    <td>
                      <BitSelect
                        value={row.observed}
                        onChange={(v) => updateRow(row.id, { observed: v })}
                        ariaLabel={`第 ${i + 1} 条记录的实测二值`}
                      />
                    </td>
                    <td className="col-diff">
                      <span className={`diff-badge diff-${row.expected ^ row.observed}`}>
                        {row.expected ^ row.observed}
                      </span>
                    </td>
                    <td className="col-op">
                      <button
                        type="button"
                        className="btn-del"
                        onClick={() => removeRow(row.id)}
                        aria-label={`删除第 ${i + 1} 条记录`}
                        disabled={rows.length <= 1}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="editor-foot">
            <button
              type="button"
              className="btn"
              onClick={addRow}
              disabled={rows.length >= MAX_RECORDS}
            >
              + 添加记录（{rows.length}/{MAX_RECORDS}）
            </button>
            <button type="button" className="btn btn-primary" onClick={submit}>
              提交诊断
            </button>
          </div>

          {revokedSat && (
            <div className="banner banner-warn" role="status">
              草稿已被修改，上一次诊断的故障名单已立即撤销，页面不再保留旧名单，请重新提交诊断。
            </div>
          )}
          {revokedUnsat && (
            <div className="banner banner-warn" role="status">
              草稿已被修改，上一次“无联合归因结论”的判定已撤销，请重新提交诊断。
            </div>
          )}
          {errors.length > 0 && (
            <div className="banner banner-error" role="alert">
              <strong>输入有误，未进行诊断：</strong>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card" aria-label="诊断结论">
          <div className="card-head">
            <h2>诊断结论</h2>
          </div>

          {result === null && !revokedSat && !revokedUnsat && errors.length === 0 && (
            <p className="placeholder">
              录入 {MIN_CHANNELS}–{MAX_CHANNELS} 个通道与 {MIN_RECORDS}–{MAX_RECORDS} 条校验记录后，
              点击“提交诊断”，此处将显示联合归因选出的故障通道。
            </p>
          )}

          {result?.status === 'unsat' && (
            <div className="banner banner-unsat" role="alert">
              <strong>无联合归因结论。</strong>
              <p>
                全部 {result.equationCount} 条校验记录构成的奇偶方程组矛盾（系数矩阵秩 {result.rank}）：
                不存在任何一个故障通道集合能够同时解释所有记录的预期与实测差异。
              </p>
              <p>请复核录入数据；系统不保留、也不给出任何故障名单。</p>
            </div>
          )}

          {result?.status === 'sat' && faultySet && (
            <SatPanel result={result} faultySet={faultySet} />
          )}
        </section>
      </main>

      <footer className="footnote">
        所有计算仅在本机浏览器内完成，通道与校验数据不会被发送到任何服务器。
      </footer>
    </div>
  );
}

function SatPanel({
  result,
  faultySet,
}: {
  result: Extract<DiagnosisResult, { status: 'sat' }>;
  faultySet: Set<number>;
}) {
  return (
    <>
      <div className="verdict">
        <div className="verdict-line">
          <span className="verdict-label">联合归因故障通道</span>
          <ChannelChips channels={result.faulty} tone="fault" />
        </div>
        <div className="verdict-meta">
          共 <strong>{result.faultyCount}</strong> 个故障通道
          {result.unique ? (
            <span className="tag tag-ok">最小故障数方案唯一</span>
          ) : (
            <span className="tag tag-warn">同故障数方案不唯一</span>
          )}
        </div>
        <p className="verdict-note">
          该集合为能同时解释全部 {result.equationCount} 条记录的所有故障集合中，
          故障数最少（{result.faultyCount} 个）且编号序列字典序最小者；
          系数矩阵秩 {result.rank}，自由变量 {result.nullity} 个。
        </p>
      </div>

      {!result.unique && result.witness && (
        <div className="witness-box">
          <div className="verdict-line">
            <span className="verdict-label">第二份见证</span>
            <ChannelChips channels={result.witness} tone="witness" />
          </div>
          <p>
            其故障数同样为 <strong>{result.witness.length}</strong> 个。两份方案的
            <strong> 首个分歧通道为第 {result.firstDivergingChannel} 号</strong>
            （主方案{faultySet.has(result.firstDivergingChannel!) ? '包含' : '不包含'}，
            第二见证{new Set(result.witness).has(result.firstDivergingChannel!) ? '包含' : '不包含'}），
            按序列字典序已优先选取主方案。
          </p>
        </div>
      )}

      <h3 className="table-title">每条记录的推导奇偶与结论</h3>
      <div className="table-wrap">
        <table className="derive-table">
          <thead>
            <tr>
              <th>#</th>
              <th>记录通道集合</th>
              <th>预期 e</th>
              <th>实测 o</th>
              <th>差异 e⊕o</th>
              <th>集合内故障通道</th>
              <th>推导奇偶</th>
              <th>结论</th>
            </tr>
          </thead>
          <tbody>
            {result.derivations.map((d) => (
              <tr key={d.index}>
                <td>{d.index + 1}</td>
                <td>
                  <ChannelChips channels={d.channels} highlight={faultySet} />
                </td>
                <td>{d.expected}</td>
                <td>{d.observed}</td>
                <td>
                  <span className={`diff-badge diff-${d.discrepancy}`}>{d.discrepancy}</span>
                </td>
                <td>
                  {d.faultyInRecord.length > 0 ? (
                    <ChannelChips channels={d.faultyInRecord} tone="fault" />
                  ) : (
                    <span className="chips-empty">无</span>
                  )}
                  <span className="muted">（{d.faultyInRecord.length} 个）</span>
                </td>
                <td>
                  <span className={`diff-badge diff-${d.faultyParity}`}>{d.faultyParity}</span>
                </td>
                <td>
                  {d.explained ? (
                    <span className="tag tag-ok">✓ 奇偶一致，解释差异</span>
                  ) : (
                    <span className="tag tag-bad">✗ 未能解释</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

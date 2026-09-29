/**
 * 采集通道翻转的“联合归因”求解器。
 *
 * 模型：设通道 i 是否发生翻转为二元变量 x_i（GF(2)）。每条校验记录给出
 * 通道集合 S、预期奇偶 e、实测奇偶 o，则联合约束为
 *
 *      XOR_{i in S} x_i = e XOR o
 *
 * 即所有记录必须由“同一个”故障集合同时解释，禁止按单条记录独立归因。
 * 求解目标：
 *   1) 故障通道总数最少（仿射陪集最小重量）；
 *   2) 同为最少时，取通道编号“升序序列”字典序最小者；
 *   3) 若该最小方案不唯一，再给出第二份见证及两者的首个分歧通道；
 *   4) 方程组矛盾时明确返回 UNSAT。
 *
 * n ≤ 30，增广矩阵的一整行可放入 31 位整数（位 0..n-1 为系数，位 n 为右端项）。
 */

export type Bit = 0 | 1;

export interface CheckRecord {
  /** 1 基通道编号，需非空、互不相同、不超过通道总数 */
  channels: number[];
  expected: Bit;
  observed: Bit;
}

export interface RecordDerivation {
  index: number;
  channels: number[];
  expected: Bit;
  observed: Bit;
  /** 预期与实测的差异位 e XOR o */
  discrepancy: Bit;
  /** 本记录集合中出现的故障通道（按编号升序） */
  faultyInRecord: number[];
  /** 集合内故障通道数的奇偶性 */
  faultyParity: Bit;
  /** 推导奇偶是否恰好解释差异位（联合解下恒为真） */
  explained: boolean;
}

export interface DiagnosisSuccess {
  status: 'sat';
  channelCount: number;
  /** 最优（故障最少、升序序列字典序最小）故障通道编号，升序 */
  faulty: number[];
  faultyCount: number;
  /** 最小重量方案是否唯一 */
  unique: boolean;
  /** 第二份同重量见证（升序），唯一时为 null */
  witness: number[] | null;
  /** 最优方案与见证的首个分歧通道（1 基编号） */
  firstDivergingChannel: number | null;
  derivations: RecordDerivation[];
  equationCount: number;
  rank: number;
  nullity: number;
}

export interface DiagnosisFailure {
  status: 'unsat';
  channelCount: number;
  equationCount: number;
  rank: number;
}

export type DiagnosisResult = DiagnosisSuccess | DiagnosisFailure;

// ---------------------------------------------------------------------------
// 位运算工具
// ---------------------------------------------------------------------------

function bitCount(x: number): number {
  x = x >>> 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

/** 最低置位位的下标（x 必须非 0） */
function ctz(x: number): number {
  return 31 - Math.clz32(x & -x);
}

/** 掩码转 1 基、升序通道编号 */
function maskToChannels(mask: number): number[] {
  const out: number[] = [];
  let m = mask >>> 0;
  while (m !== 0) {
    const k = ctz(m);
    out.push(k + 1);
    m &= m - 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 输入校验
// ---------------------------------------------------------------------------

export function validateInput(channelCount: number, records: CheckRecord[]): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(channelCount) || channelCount < 1) {
    errors.push('通道总数必须为正整数。');
  }
  records.forEach((r, i) => {
    const where = `第 ${i + 1} 条记录`;
    if (!Array.isArray(r.channels) || r.channels.length === 0) {
      errors.push(`${where}：通道集合必须非空。`);
      return;
    }
    const bad = r.channels.filter((c) => !Number.isInteger(c) || c < 1 || c > channelCount);
    if (bad.length > 0) {
      errors.push(`${where}：通道编号 ${bad.join(', ')} 超出 1..${channelCount} 范围。`);
    }
    if (new Set(r.channels).size !== r.channels.length) {
      errors.push(`${where}：通道集合内存在重复编号。`);
    }
    if (r.expected !== 0 && r.expected !== 1) {
      errors.push(`${where}：预期二值必须为 0 或 1。`);
    }
    if (r.observed !== 0 && r.observed !== 1) {
      errors.push(`${where}：实测二值必须为 0 或 1。`);
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// GF(2) 高斯-约当消元
// ---------------------------------------------------------------------------

interface Rref {
  /** 主元行（已归一、互消），每行位 0..n-1 为系数，位 n 为右端项 */
  pivotRows: number[];
  pivotCols: number[];
  freeCols: number[];
  inconsistent: boolean;
  rank: number;
}

const rhsBit = (n: number) => 1 << n;

function rref(rows: number[], n: number): Rref {
  const m = rows.length;
  const mat = rows.slice();
  const pivotCols: number[] = [];
  let r = 0;

  for (let c = 0; c < n && r < m; c++) {
    let sel = -1;
    for (let i = r; i < m; i++) {
      if ((mat[i] >>> c) & 1) {
        sel = i;
        break;
      }
    }
    if (sel === -1) continue;
    const tmp = mat[r];
    mat[r] = mat[sel];
    mat[sel] = tmp;
    for (let i = 0; i < m; i++) {
      if (i !== r && ((mat[i] >>> c) & 1)) mat[i] ^= mat[r];
    }
    pivotCols.push(c);
    r++;
  }

  const coeffMask = n >= 31 ? 0x7fffffff : (1 << n) - 1;
  let inconsistent = false;
  for (let i = 0; i < m; i++) {
    if ((mat[i] & coeffMask) === 0 && ((mat[i] >>> n) & 1) === 1) inconsistent = true;
  }

  const pivotSet = new Set(pivotCols);
  const freeCols: number[] = [];
  for (let c = 0; c < n; c++) if (!pivotSet.has(c)) freeCols.push(c);

  return { pivotRows: mat.slice(0, r), pivotCols, freeCols, inconsistent, rank: r };
}

/** 由 RREF 构造特解 p（自由变量全 0）与零空间基底 basis（各对应一个自由变量）。 */
function particularAndBasis(ref: Rref, n: number): { p: number; basis: number[] } {
  const rhs = rhsBit(n);
  let p = 0;
  ref.pivotRows.forEach((row, i) => {
    if ((row & rhs) !== 0) p |= 1 << ref.pivotCols[i];
  });
  const basis = ref.freeCols.map((f) => {
    let v = 1 << f;
    ref.pivotRows.forEach((row, i) => {
      if (((row >>> f) & 1) !== 0) v |= 1 << ref.pivotCols[i];
    });
    return v;
  });
  return { p, basis };
}

// ---------------------------------------------------------------------------
// 陪集最小重量搜索：x(y) = p XOR XOR basis[j]*y_j，在自由变量空间上分支定界
//
// 顺序约定（坐标编号越小越早“定型”）：lastTouch[k] = 最后一个影响坐标 k 的
// 自由变量下标。处理 y_j 后，恰有 bucket[j] 中的坐标永不被后续基底触及，其
// 最终位已定，可据此做重量剪枝；untouched 坐标在进入搜索时即定型。
// ---------------------------------------------------------------------------

interface SolveOpts {
  /** 只接受重量 ≤ cap 的解 */
  cap?: number;
  /** 需要排除的完整赋值掩码（如已找到的最优解，用于求第二见证） */
  exclude?: number | null;
}

interface Solution {
  weight: number;
  mask: number;
}

/**
 * 等重量方案的 tiebreak：通道编号“升序序列”字典序。
 * 掩码最低差异位上为 1 的方案包含更小的分歧通道，因而序列字典序更小。
 */
function lexBetter(a: number, b: number): boolean {
  const d = (a ^ b) >>> 0;
  if (d === 0) return false;
  return ((a >>> ctz(d)) & 1) === 1;
}

function solveCoset(p: number, basis: number[], n: number, opts: SolveOpts = {}): Solution | null {
  const f = basis.length;
  const exclude = opts.exclude ?? null;

  const lastTouch = new Int32Array(n).fill(-1);
  for (let j = 0; j < f; j++) {
    let b = basis[j] >>> 0;
    while (b !== 0) {
      const k = ctz(b);
      lastTouch[k] = j;
      b &= b - 1;
    }
  }
  const bucket = new Array<number>(f).fill(0);
  let untouched = 0;
  for (let k = 0; k < n; k++) {
    if (lastTouch[k] === -1) untouched |= 1 << k;
    else bucket[lastTouch[k]] |= 1 << k;
  }

  // 贪心种子：每步选让当前已定型重量更小的取值，快速拿到高质量（常即最优）上界。
  let seed = p >>> 0;
  let seedFixed = bitCount(seed & untouched);
  for (let j = 0; j < f; j++) {
    const w0 = seedFixed + bitCount(seed & bucket[j]);
    const w1 = seedFixed + bitCount((seed ^ basis[j]) & bucket[j]);
    if (w1 < w0) seed = (seed ^ basis[j]) >>> 0;
    seedFixed = Math.min(w0, w1);
  }
  const seedWeight = bitCount(seed);

  let best: Solution | null = null;
  let cap = opts.cap ?? n;
  if (seedWeight <= cap && seed !== exclude) {
    best = { weight: seedWeight, mask: seed };
    if (opts.cap === undefined) cap = seedWeight;
  }

  const consider = (w: number, mask: number): void => {
    if (w > cap || mask === exclude) return;
    if (best === null || w < best.weight || (w === best.weight && lexBetter(mask, best.mask))) {
      best = { weight: w, mask };
      if (opts.cap === undefined) cap = w;
    }
  };

  const dfs = (j: number, cur: number, fixedW: number): void => {
    if (fixedW > cap) return; // 已定型的 1 不可能被后续自由变量消除
    if (j === f) {
      consider(fixedW, cur >>> 0);
      return;
    }
    const w0 = fixedW + bitCount(cur & bucket[j]);
    const w1 = fixedW + bitCount((cur ^ basis[j]) & bucket[j]);
    // 重量更优分支先探，尽快收紧上界；等重时先取 0（保持遍历确定性）。
    const branches: Array<[number, number]> = w1 < w0 ? [[1, w1], [0, w0]] : [[0, w0], [1, w1]];
    for (const [v, w] of branches) {
      if (w <= cap) dfs(j + 1, v ? (cur ^ basis[j]) >>> 0 : cur >>> 0, w);
    }
  };

  dfs(0, p >>> 0, bitCount(p & untouched));
  return best;
}

// ---------------------------------------------------------------------------
// 对外主入口
// ---------------------------------------------------------------------------

export function diagnose(channelCount: number, records: CheckRecord[]): DiagnosisResult {
  const errors = validateInput(channelCount, records);
  if (errors.length > 0) throw new Error(errors.join('\n'));

  const n = channelCount;
  const rows = records.map((r) => {
    let row = 0;
    for (const c of r.channels) row |= 1 << (c - 1);
    if ((r.expected ^ r.observed) === 1) row |= rhsBit(n);
    return row;
  });

  const ref = rref(rows, n);
  if (ref.inconsistent) {
    return { status: 'unsat', channelCount: n, equationCount: records.length, rank: ref.rank };
  }

  const { p, basis } = particularAndBasis(ref, n);
  const best = solveCoset(p, basis, n);
  // 相容系统必有解（特解 p 本身），此处仅为类型与防御式编程。
  if (best === null) {
    return { status: 'unsat', channelCount: n, equationCount: records.length, rank: ref.rank };
  }

  const second = solveCoset(p, basis, n, { cap: best.weight, exclude: best.mask });

  const derivations: RecordDerivation[] = records.map((r, i) => {
    const recordChannels = r.channels.slice().sort((a, b) => a - b);
    const faultyInRecord = recordChannels.filter((c) => ((best.mask >>> (c - 1)) & 1) === 1);
    const faultyParity = (faultyInRecord.length & 1) as Bit;
    const discrepancy = ((r.expected ^ r.observed) & 1) as Bit;
    return {
      index: i,
      channels: recordChannels,
      expected: r.expected,
      observed: r.observed,
      discrepancy,
      faultyInRecord,
      faultyParity,
      explained: faultyParity === discrepancy,
    };
  });

  let firstDivergingChannel: number | null = null;
  if (second !== null) {
    firstDivergingChannel = ctz((best.mask ^ second.mask) >>> 0) + 1;
  }

  return {
    status: 'sat',
    channelCount: n,
    faulty: maskToChannels(best.mask),
    faultyCount: best.weight,
    unique: second === null,
    witness: second === null ? null : maskToChannels(second.mask),
    firstDivergingChannel,
    derivations,
    equationCount: records.length,
    rank: ref.rank,
    nullity: n - ref.rank,
  };
}

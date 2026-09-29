/**
 * 联合奇偶归因（syndrome diagnosis over GF(2)）
 *
 * 每条校验记录给出一个非空通道集合 S 以及预期/实测两个二值。
 * 当且仅当 S 中翻转（故障）通道数为奇数时，实测相对预期发生翻转：
 *
 *     XOR_{c in S} x_c = expected XOR measured
 *
 * 所有记录必须由【同一个】故障通道集合同时解释，禁止按单条记录独立归因。
 * 解空间是 GF(2) 上的线性仿射空间：先求含故障数最少的方案（唯一），
 * 再求与它在最低编号通道上首次出现分歧、且同样故障数最少的第二份见证方案。
 */

export interface CheckRecord {
  id: string;
  /** 非空通道编号集合（编号须存在于通道表中） */
  channels: number[];
  expected: 0 | 1;
  measured: 0 | 1;
}

export interface DiagnosisInput {
  /** 按编号排列的全部通道（8~30 个，编号唯一） */
  channels: number[];
  records: CheckRecord[];
}

export interface RecordConclusion {
  record: CheckRecord;
  /** 该记录集合中由故障集合推导出的故障通道数 */
  faultCountInSet: number;
  /** 推导出的奇偶性 0=偶 1=奇 */
  parity: 0 | 1;
  /** 预期与实测是否不同（即记录要求的奇偶性） */
  requiredParity: 0 | 1;
  /** 该奇偶性是否恰好解释预期与实测的差异 */
  explained: boolean;
}

export interface Witness {
  faults: number[];
}

export interface DiagnosisResult {
  solvable: boolean;
  /** 故障数最少且编号序列字典序最小的方案（无解时为 null） */
  primary: Witness | null;
  /**
   * 同样达到最小故障数、且与主方案在最低编号通道上首次分歧的第二份见证。
   * 若最小方案唯一则为 null。
   */
  second: Witness | null;
  /** 主方案与第二份见证首个分歧的通道编号（无第二份见证时为 null） */
  firstDivergentChannel: number | null;
  conclusions: RecordConclusion[];
  /** 全部最小故障数方案的数量（无解为 0） */
  minimumSolutionCount: number;
  /** 自由变量个数（解仿射空间维数） */
  degreesOfFreedom: number;
  /** 参与联合归因的校验记录数（无解时结论表为空但记录数仍可展示） */
  recordCount: number;
}

/** 对 rows 原地做 GF(2) 高斯-若尔当消元，返回主元列下标（升序） */
function rref(rows: number[], width: number): { pivots: number[]; rank: number } {
  let rank = 0;
  const pivots: number[] = [];
  for (let col = 0; col < width && rank < rows.length; col++) {
    let pivot = -1;
    for (let r = rank; r < rows.length; r++) {
      if ((rows[r] >> col) & 1) {
        pivot = r;
        break;
      }
    }
    if (pivot === -1) continue;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let r = 0; r < rows.length; r++) {
      if (r !== rank && ((rows[r] >> col) & 1)) {
        rows[r] ^= rows[rank];
      }
    }
    pivots.push(col);
    rank++;
  }
  return { pivots, rank };
}

/** 将通道编号数组压缩为 bitset，第 k 位对应通道下标 k */
function toBitset(channelNums: number[], indexByChannel: Map<number, number>): number {
  let bits = 0;
  for (const ch of channelNums) bits |= 1 << indexByChannel.get(ch)!;
  return bits;
}

/** bitset 转回按通道编号升序排列的数组 */
function fromBitset(bits: number, channels: number[]): number[] {
  const out: number[] = [];
  for (let k = 0; k < channels.length; k++) {
    if ((bits >> k) & 1) out.push(channels[k]);
  }
  return out;
}

/**
 * 给定 RREF 后的方程组，枚举全部 2^f 个解，仅保留 popcount 最小者。
 *
 * 解形如 x(a) = base XOR ⊕_{j : a_j=1} colMask[j]，其中 colMask[j] 是第 j 个
 * 自由变量取 1 时对解向量的贡献（自由位本身 + 受其影响的主元位）。
 * 以 Gray 码顺序枚举，相邻赋值只翻转一个自由变量，每步一次异或即可更新 x。
 * 字典序（按通道下标从低到高比较首个分歧位，0 小于 1）通过专门的比较器维护，
 * 与枚举次序无关。
 */
function enumerateMinimum(
  rows: number[],
  pivots: number[],
  rank: number,
  freeCols: number[],
  n: number
): { solutions: number[]; minWeight: number; minCount: number; total: number } {
  const f = freeCols.length;

  let base = 0;
  for (let r = 0; r < rank; r++) {
    if ((rows[r] >> n) & 1) base |= 1 << pivots[r];
  }

  const colMasks = freeCols.map((col) => {
    let mask = 1 << col;
    for (let r = 0; r < rank; r++) {
      if ((rows[r] >> col) & 1) mask |= 1 << pivots[r];
    }
    return mask;
  });

  let minWeight = countBits(base);
  let minCount = 0;
  let first = -1;
  let second = -1;

  // 编号序列字典序：故障编号升序排列后逐元素比较，首个不同元素更小者胜出。
  // 对两个等权（等长）故障集，这等价于：对称差中的最小编号属于谁，谁更小。
  const lessLex = (a: number, b: number): boolean => {
    const diff = a ^ b;
    const lowest = diff & -diff;
    return (a & lowest) !== 0;
  };

  const consider = (x: number, w: number) => {
    if (w < minWeight) {
      minWeight = w;
      minCount = 1;
      first = x;
      second = -1;
    } else if (w === minWeight) {
      minCount++;
      if (first === -1) {
        first = x;
      } else if (lessLex(x, first)) {
        second = first;
        first = x;
      } else if (second === -1 || lessLex(x, second)) {
        second = x;
      }
    }
  };

  let x = base;
  consider(x, minWeight);

  const total = 1 << f;
  for (let a = 1; a < total; a++) {
    // gray(a-1) -> gray(a) 翻转的自由变量下标 = ctz(a)
    const low = a & -a;
    const j = 31 - Math.clz32(low);
    x ^= colMasks[j];
    consider(x, countBits(x));
  }

  const solutions: number[] = [];
  if (first !== -1) solutions.push(first);
  if (second !== -1) solutions.push(second);
  return { solutions, minWeight, minCount, total };
}

function countBits(x: number): number {
  x = x - ((x >> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  x = (x + (x >> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

export function diagnose(input: DiagnosisInput): DiagnosisResult {
  const channels = [...input.channels].sort((a, b) => a - b);
  const n = channels.length;
  const indexByChannel = new Map<number, number>();
  channels.forEach((ch, k) => indexByChannel.set(ch, k));

  // 每行：低 n 位为系数，第 n 位为右端项（expected XOR measured）
  const rows: number[] = input.records.map((rec) => {
    let row = toBitset(rec.channels, indexByChannel);
    if (rec.expected !== rec.measured) row |= 1 << n;
    return row;
  });

  const { pivots, rank } = rref(rows, n);

  // 相容性：RREF 中出现 0 = 1 行
  for (let r = 0; r < rows.length; r++) {
    const coeff = rows[r] & ((1 << n) - 1);
    const rhs = (rows[r] >> n) & 1;
    if (coeff === 0 && rhs === 1) {
      return {
        solvable: false,
        primary: null,
        second: null,
        firstDivergentChannel: null,
        conclusions: [],
        minimumSolutionCount: 0,
        degreesOfFreedom: 0,
        recordCount: input.records.length,
      };
    }
  }

  const pivotSet = new Set(pivots);
  const freeCols: number[] = [];
  for (let k = 0; k < n; k++) if (!pivotSet.has(k)) freeCols.push(k);

  const { solutions, minCount } = enumerateMinimum(rows, pivots, rank, freeCols, n);

  const primaryBits = solutions[0] ?? 0;
  const secondBits = solutions.length > 1 ? solutions[1] : null;

  const primaryFaults = fromBitset(primaryBits, channels);
  const primarySet = new Set(primaryFaults);

  const conclusions: RecordConclusion[] = input.records.map((rec) => {
    let faultCountInSet = 0;
    for (const ch of rec.channels) if (primarySet.has(ch)) faultCountInSet++;
    const parity = (faultCountInSet % 2) as 0 | 1;
    const requiredParity = (rec.expected ^ rec.measured) as 0 | 1;
    return {
      record: rec,
      faultCountInSet,
      parity,
      requiredParity,
      explained: parity === requiredParity,
    };
  });

  let firstDivergentChannel: number | null = null;
  if (secondBits !== null) {
    const diff = primaryBits ^ secondBits;
    const lowestBit = diff & -diff;
    const idx = Math.log2(lowestBit);
    firstDivergentChannel = channels[idx];
  }

  return {
    solvable: true,
    primary: { faults: primaryFaults },
    second: secondBits !== null ? { faults: fromBitset(secondBits, channels) } : null,
    firstDivergentChannel,
    conclusions,
    minimumSolutionCount: minCount,
    degreesOfFreedom: freeCols.length,
    recordCount: input.records.length,
  };
}

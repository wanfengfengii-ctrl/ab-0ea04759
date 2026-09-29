/**
 * 将用户在输入框中填写的通道集合文本解析为编号数组。
 * 支持中英文逗号、顿号、分号、空白与换行作为分隔符。
 * 返回去重前保留原始顺序的编号，以及解析中发现的词法错误。
 */
export interface ParseResult {
  values: number[];
  /** 无法识别为正整数的原始词元 */
  invalidTokens: string[];
}

export function parseChannelList(text: string): ParseResult {
  const tokens = text
    .split(/[,，、;；\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const values: number[] = [];
  const invalidTokens: string[] = [];
  for (const tok of tokens) {
    if (!/^\d+$/.test(tok)) {
      invalidTokens.push(tok);
      continue;
    }
    const v = Number(tok);
    if (Number.isSafeInteger(v) && v >= 1) values.push(v);
    else invalidTokens.push(tok);
  }
  return { values, invalidTokens };
}

export function formatChannelList(channels: number[]): string {
  return channels.join(', ');
}

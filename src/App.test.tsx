import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import App from './App';

describe('App 初始渲染', () => {
  it('在示例数据下无异常并渲染关键区域', () => {
    const html = renderToString(<App />);
    expect(html).toContain('采集通道翻转联合归因');
    expect(html).toContain('校验数据录入');
    expect(html).toContain('提交诊断');
    expect(html).toContain('载入示例');
    // 尚未提交诊断时不显示任何故障名单
    expect(html).not.toContain('联合归因故障通道');
    expect(html).not.toContain('无联合归因结论');
  });
});

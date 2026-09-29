import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// 每个用例后卸载组件并清掉 document.body，避免跨用例重复元素
afterEach(() => {
  cleanup();
});

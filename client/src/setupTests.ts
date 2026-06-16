import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window and document properties if not in jsdom
if (typeof window === 'undefined') {
  global.window = {} as any;
}
if (typeof document === 'undefined') {
  global.document = {} as any;
}
if (typeof navigator === 'undefined') {
  global.navigator = {
    userAgent: 'node.js',
  } as any;
}

global.sessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
} as Storage;

global.WebSocket = class {
  constructor(url: string) {}
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
} as any;
// Add jest mock object pointing to vi for compatibility
(global as any).jest = {
  mock: vi.mock,
  fn: vi.fn,
  spyOn: vi.spyOn,
  requireActual: vi.importActual,
  clearAllMocks: vi.clearAllMocks,

  useFakeTimers: vi.useFakeTimers,
  useRealTimers: vi.useRealTimers,
  runOnlyPendingTimers: vi.runOnlyPendingTimers,
  advanceTimersByTime: vi.advanceTimersByTime,
  restoreAllMocks: vi.restoreAllMocks,

  resetAllMocks: vi.resetAllMocks,
};

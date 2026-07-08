/**
 * Jest 설정 파일
 * 각 테스트 실행 전에 로드됩니다
 */

// testing-library/jest-dom을 import하여 커스텀 matchers 추가
import "@testing-library/jest-dom";

// ResizeObserver 모킹 (모든 테스트에서 사용)
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
  disconnect() {
    // Mock implementation
  }
};

// window.matchMedia 모킹
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// HTMLElement.prototype.scrollIntoView 모킹
HTMLElement.prototype.scrollIntoView = jest.fn();

// 콘솔 에러/경고 억제 (선택사항)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};

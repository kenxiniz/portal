/**
 * browser-resize.test.tsx
 * 브라우저 리사이징 통합 테스트
 */

import React from "react";
import { render, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StockChartDisplay } from "../StockChartDisplay";

// Mock lightweight-charts
const mockChart = {
  addSeries: jest.fn(() => ({
    setData: jest.fn(),
    applyOptions: jest.fn(),
    createPriceLine: jest.fn(() => ({})),
    removePriceLine: jest.fn(),
    attachPrimitive: jest.fn(),
  })),
  applyOptions: jest.fn(),
  timeScale: jest.fn(() => ({
    subscribeVisibleLogicalRangeChange: jest.fn(),
    unsubscribeVisibleLogicalRangeChange: jest.fn(),
    setVisibleLogicalRange: jest.fn(),
    fitContent: jest.fn(),
  })),
  remove: jest.fn(),
  resize: jest.fn(),
  options: jest.fn(() => ({ height: 500 })),
};

jest.mock("lightweight-charts", () => ({
  createChart: jest.fn(() => mockChart),
  ColorType: { Solid: 0 },
  CrosshairMode: { Normal: 0 },
  CandlestickSeries: "Candlestick",
  LineSeries: "Line",
  HistogramSeries: "Histogram",
}));

const mockData = [
  {
    date: "2024-01-01",
    open: 100,
    high: 105,
    low: 99,
    close: 103,
    volume: 1000,
  },
];

describe("브라우저 리사이징 통합 테스트", () => {
  let resizeCallback: ResizeObserverCallback;

  beforeEach(() => {
    jest.clearAllMocks();

    // ResizeObserver Mock
    global.ResizeObserver = jest.fn().mockImplementation((callback) => {
      resizeCallback = callback;
      return {
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: jest.fn(),
      };
    });
  });

  it("브라우저 높이 변경 시 차트 높이가 동적으로 조정되어야 함", async () => {
    const { container } = render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

    const chartContainer = container.querySelector(".flex-1");
    expect(chartContainer).toBeInTheDocument();

    // 초기 높이 설정
    Object.defineProperty(chartContainer, "clientHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(chartContainer, "clientWidth", {
      configurable: true,
      value: 1920,
    });

    // ResizeObserver 콜백 트리거
    act(() => {
      resizeCallback(
        [
          {
            target: chartContainer,
            contentRect: { height: 1000, width: 1920 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".flex-shrink-0");
      expect(wrappers.length).toBeGreaterThan(0);

      // 높이가 설정되었는지 확인
      wrappers.forEach((wrapper) => {
        const height = (wrapper as HTMLElement).style.height;
        expect(height).toBeTruthy();
        expect(parseInt(height)).toBeGreaterThan(0);
      });
    });

    // 브라우저 높이 변경 시뮬레이션
    Object.defineProperty(chartContainer, "clientHeight", {
      configurable: true,
      value: 1500, // 높이 증가
    });

    act(() => {
      resizeCallback(
        [
          {
            target: chartContainer,
            contentRect: { height: 1500, width: 1920 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".flex-shrink-0");

      // 높이가 증가했는지 확인
      wrappers.forEach((wrapper) => {
        const height = (wrapper as HTMLElement).style.height;
        expect(height).toBeTruthy();
        // 높이가 이전보다 커야 함
        expect(parseInt(height)).toBeGreaterThan(200);
      });
    });
  });

  it("브라우저 너비 변경 시 차트 너비가 동적으로 조정되어야 함", async () => {
    const { container } = render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

    const chartContainer = container.querySelector(".flex-1");

    // 초기 너비 설정
    Object.defineProperty(chartContainer, "clientHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(chartContainer, "clientWidth", {
      configurable: true,
      value: 1920,
    });

    act(() => {
      resizeCallback(
        [
          {
            target: chartContainer,
            contentRect: { height: 1000, width: 1920 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    // 브라우저 너비 변경
    Object.defineProperty(chartContainer, "clientWidth", {
      configurable: true,
      value: 1440, // 너비 감소
    });

    act(() => {
      resizeCallback(
        [
          {
            target: chartContainer,
            contentRect: { height: 1000, width: 1440 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    await waitFor(() => {
      // autoSize가 활성화되어 있으므로 차트가 자동으로 너비 조정
      expect(container.querySelector(".flex-1")).toBeInTheDocument();
    });
  });

  it("브라우저 크기 급격한 변경 시에도 안정적으로 동작해야 함", async () => {
    const { container } = render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

    const chartContainer = container.querySelector(".flex-1");

    // 여러 번 연속으로 리사이즈
    const sizes = [
      { height: 800, width: 1440 },
      { height: 1000, width: 1920 },
      { height: 600, width: 1024 },
      { height: 1200, width: 2560 },
    ];

    for (const size of sizes) {
      Object.defineProperty(chartContainer, "clientHeight", {
        configurable: true,
        value: size.height,
      });
      Object.defineProperty(chartContainer, "clientWidth", {
        configurable: true,
        value: size.width,
      });

      act(() => {
        resizeCallback(
          [
            {
              target: chartContainer,
              contentRect: size as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          {} as ResizeObserver,
        );
      });
    }

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".flex-shrink-0");
      expect(wrappers.length).toBeGreaterThan(0);

      // 마지막 크기에 맞게 조정되었는지 확인
      wrappers.forEach((wrapper) => {
        const height = (wrapper as HTMLElement).style.height;
        expect(height).toBeTruthy();
        expect(parseInt(height)).toBeGreaterThan(0);
      });
    });
  });

  it("timeframe 변경 후에도 브라우저 리사이징이 정상 동작해야 함", async () => {
    const { container, rerender } = render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

    const chartContainer = container.querySelector(".flex-1");

    // timeframe 변경
    rerender(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1h"
      />,
    );

    // 브라우저 크기 변경
    Object.defineProperty(chartContainer, "clientHeight", {
      configurable: true,
      value: 1200,
    });
    Object.defineProperty(chartContainer, "clientWidth", {
      configurable: true,
      value: 1920,
    });

    act(() => {
      resizeCallback(
        [
          {
            target: chartContainer,
            contentRect: { height: 1200, width: 1920 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".flex-shrink-0");
      // 1h 모드에서는 PivotChart가 추가되므로 더 많은 wrapper가 있어야 함
      expect(wrappers.length).toBeGreaterThan(2);
    });
  });
});

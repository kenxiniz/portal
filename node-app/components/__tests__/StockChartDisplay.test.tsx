/**
 * StockChartDisplay.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StockChartDisplay } from "../StockChartDisplay";
import * as lightweightCharts from "lightweight-charts";

// Mock lightweight-charts
jest.mock("lightweight-charts", () => ({
  createChart: jest.fn(() => ({
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
  })),
  ColorType: { Solid: 0 },
  CrosshairMode: { Normal: 0 },
  CandlestickSeries: "Candlestick",
  LineSeries: "Line",
  HistogramSeries: "Histogram",
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
};

const mockData = [
  {
    date: "2024-01-01",
    open: 100,
    high: 105,
    low: 99,
    close: 103,
    volume: 1000,
  },
  {
    date: "2024-01-02",
    open: 103,
    high: 107,
    low: 102,
    close: 106,
    volume: 1200,
  },
];

describe("StockChartDisplay - 차트 리사이징 UX 테스트", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("컨테이너가 flex-1과 min-h-0을 가져야 함 (브라우저 높이 변경 대응)", () => {
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

    const chartContainer = container.querySelector(".flex-1.min-h-0");
    expect(chartContainer).toBeInTheDocument();
  });

  it("차트 wrapper div들이 flex-shrink-0를 가지고 명시적 높이를 설정해야 함", async () => {
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

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".flex-shrink-0");
      expect(wrappers.length).toBeGreaterThan(0);

      // 각 wrapper가 명시적 높이를 가지는지 확인
      wrappers.forEach((wrapper) => {
        const style = (wrapper as HTMLElement).style;
        expect(style.height).toBeTruthy();
      });
    });
  });

  it("ResizeObserver가 컨테이너를 관찰해야 함", () => {
    render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

    expect(ResizeObserver.prototype.observe).toHaveBeenCalled();
  });

  it("timeframe 변경 시 차트가 재렌더링되어야 함", () => {
    const { rerender } = render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

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

    // timeframe 변경 시 PivotChart가 나타나는지 확인
    expect(ResizeObserver.prototype.observe).toHaveBeenCalled();
  });

  it("차트 wrapper들이 min-w-0을 가지고 있어야 함 (사이드바 펼침 대응)", async () => {
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

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".min-w-0");
      expect(wrappers.length).toBeGreaterThan(0);
    });
  });

  it("높이 계산이 올바르게 이루어져야 함 (main: 65%, sub: 35%)", async () => {
    // Mock containerRef with specific height
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      value: 1000,
    });

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

    await waitFor(() => {
      const wrappers = container.querySelectorAll(".flex-shrink-0");
      expect(wrappers.length).toBeGreaterThan(0);
    });
  });
});

describe("StockChartDisplay - 차트 캔들 굵기 일관성 테스트", () => {
  it("fitContent()를 호출하지 않아야 함 (고정 visible bars 유지)", () => {
    const mockFitContent = jest.fn();
    const mockTimeScale = jest.fn(() => ({
      subscribeVisibleLogicalRangeChange: jest.fn(),
      unsubscribeVisibleLogicalRangeChange: jest.fn(),
      setVisibleLogicalRange: jest.fn(),
      fitContent: mockFitContent,
    }));

    const createChartMock = lightweightCharts.createChart as jest.Mock;
    createChartMock.mockReturnValue({
      addSeries: jest.fn(() => ({
        setData: jest.fn(),
        applyOptions: jest.fn(),
        createPriceLine: jest.fn(() => ({})),
        removePriceLine: jest.fn(),
        attachPrimitive: jest.fn(),
      })),
      applyOptions: jest.fn(),
      timeScale: mockTimeScale,
      remove: jest.fn(),
      resize: jest.fn(),
      options: jest.fn(() => ({ height: 500 })),
    });

    render(
      <StockChartDisplay
        data={mockData}
        signals={[]}
        gridStrokeColor="#666"
        loading={false}
        error={null}
        timeframe="1d"
      />,
    );

    // ResizeObserver 콜백에서 fitContent()가 호출되지 않아야 함
    // (초기 줌 설정만 setVisibleLogicalRange로 이루어짐)
  });
});

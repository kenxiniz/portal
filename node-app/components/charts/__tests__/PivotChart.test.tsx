/**
 * PivotChart.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { PivotChart } from "../PivotChart";
import * as lightweightCharts from "lightweight-charts";
import type { Time } from "lightweight-charts";

const mockChart = {
  addSeries: jest.fn(() => ({
    setData: jest.fn(),
    applyOptions: jest.fn(),
  })),
  applyOptions: jest.fn(),
  timeScale: jest.fn(() => ({
    subscribeVisibleLogicalRangeChange: jest.fn(),
    unsubscribeVisibleLogicalRangeChange: jest.fn(),
  })),
  remove: jest.fn(),
};

jest.mock("lightweight-charts", () => ({
  createChart: jest.fn(() => mockChart),
  ColorType: { Solid: 0 },
  CrosshairMode: { Normal: 0 },
  CandlestickSeries: "Candlestick",
  LineSeries: "Line",
}));

jest.mock("@/lib/charts/indicators", () => ({
  calculatePivotPoints: jest.fn((data) =>
    data.map(() => ({
      p: 100,
      r2: 105,
      r3: 110,
      s2: 95,
      s3: 90,
    })),
  ),
}));

const mockData = [
  {
    time: "2024-01-01" as Time,
    date: "2024-01-01",
    open: 100,
    high: 105,
    low: 99,
    close: 103,
    volume: 1000,
    color: "#E53935",
  },
];

const mockOnReady = jest.fn();

describe("PivotChart - autoSize 및 리사이징 UX 테스트", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createChart 호출 시 autoSize: true 옵션이 설정되어야 함", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;

    render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    expect(createChartMock).toHaveBeenCalled();
    const options = createChartMock.mock.calls[0][1];
    expect(options.autoSize).toBe(true);
  });

  it("컨테이너 div가 width: 100%와 minWidth: 0을 가져야 함", () => {
    const { container } = render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    const chartDiv = container.querySelector("div");
    expect(chartDiv).toBeInTheDocument();
    expect(chartDiv?.style.width).toBe("100%");
    expect(chartDiv?.style.minWidth).toBe("0");
  });

  it("높이 변경 시 applyOptions가 호출되어야 함", () => {
    const { rerender } = render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    jest.clearAllMocks();

    rerender(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={700}
        onReady={mockOnReady}
      />,
    );

    expect(mockChart.applyOptions).toHaveBeenCalledWith({ height: 700 });
  });
});

describe("PivotChart - Pivot 라인 표시 UX 테스트", () => {
  it("6개의 라인 시리즈가 생성되어야 함 (candle + P + R2 + R3 + S2 + S3)", () => {
    render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    // Candlestick + 5개의 LineSeries = 6개
    expect(mockChart.addSeries).toHaveBeenCalledTimes(6);
  });

  it("Pivot Point (P) 라인이 분홍색이고 굵기가 3이어야 함", () => {
    const LineSeriesMock = lightweightCharts.LineSeries;

    render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    // 두 번째 addSeries 호출이 P 라인 (첫 번째는 Candlestick)
    const pLineCall = mockChart.addSeries.mock.calls.find(
      (call) => call[0] === LineSeriesMock && call[1].lineWidth === 3,
    );

    expect(pLineCall).toBeDefined();
    expect(pLineCall[1].color).toBe("#FFB6C1"); // Light pink
  });

  it("저항/지지 라인들이 대각선(lineType: 0)으로 표시되어야 함", () => {
    const LineSeriesMock = lightweightCharts.LineSeries;

    render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    const lineSeriesCalls = mockChart.addSeries.mock.calls.filter(
      (call) => call[0] === LineSeriesMock,
    );

    // 모든 라인이 lineType: 0 (Simple/대각선)을 가져야 함
    lineSeriesCalls.forEach((call) => {
      expect(call[1].lineType).toBe(0);
    });
  });

  it("timeframe 변경 시 차트가 재생성되어야 함", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;
    const { rerender } = render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    const callsBefore = createChartMock.mock.calls.length;

    rerender(
      <PivotChart
        data={mockData}
        timeframe="15m"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    expect(createChartMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe("PivotChart - 차트 정리 테스트", () => {
  it("컴포넌트 언마운트 시 차트가 제거되어야 함", () => {
    const { unmount } = render(
      <PivotChart
        data={mockData}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    unmount();

    expect(mockChart.remove).toHaveBeenCalled();
  });
});

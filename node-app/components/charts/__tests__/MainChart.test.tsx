/**
 * MainChart.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MainChart } from "../MainChart";
import * as lightweightCharts from "lightweight-charts";
import type { Time } from "lightweight-charts";

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
};

jest.mock("lightweight-charts", () => ({
  createChart: jest.fn(() => mockChart),
  ColorType: { Solid: 0 },
  CrosshairMode: { Normal: 0 },
  CandlestickSeries: "Candlestick",
  LineSeries: "Line",
}));

// Mock GaussianBoxPrimitive
jest.mock("../plugins/GaussianBoxPrimitive", () => ({
  GaussianBoxPrimitive: jest.fn().mockImplementation(() => ({
    setData: jest.fn(),
  })),
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

describe("MainChart - autoSize 및 리사이징 UX 테스트", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createChart 호출 시 autoSize: true 옵션이 설정되어야 함", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;

    render(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
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
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    const chartContainer = container.querySelector("div");
    expect(chartContainer).toBeInTheDocument();
    expect(chartContainer?.style.width).toBe("100%");
    expect(chartContainer?.style.minWidth).toBe("0");
  });

  it("높이 변경 시 applyOptions가 호출되어야 함", () => {
    const { rerender } = render(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    jest.clearAllMocks();

    rerender(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
        gridStrokeColor="#666"
        height={700}
        onReady={mockOnReady}
      />,
    );

    expect(mockChart.applyOptions).toHaveBeenCalledWith({ height: 700 });
  });

  it("onReady 콜백이 차트 인스턴스와 함께 호출되어야 함", () => {
    render(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    expect(mockOnReady).toHaveBeenCalledWith(mockChart);
  });

  it("probLevels의 priceLine이 투명 선으로 생성되어야 함 (라벨만 표시)", () => {
    const mockCreatePriceLine = jest.fn(() => ({}));
    const mockCandleSeries = {
      setData: jest.fn(),
      applyOptions: jest.fn(),
      createPriceLine: mockCreatePriceLine,
      removePriceLine: jest.fn(),
      attachPrimitive: jest.fn(),
    };

    mockChart.addSeries.mockReturnValueOnce(mockCandleSeries);

    const probLevels = [
      { price: 100, title: "Support", color: "#00ff00" },
      { price: 110, title: "Resistance", color: "#ff0000" },
    ];

    render(
      <MainChart
        data={mockData}
        probLevels={probLevels}
        timeframe="1d"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    // probLevels가 priceLine으로 추가되는지 확인
    expect(mockCreatePriceLine).toHaveBeenCalled();
    const priceLineOptions = mockCreatePriceLine.mock.calls[0][0];
    expect(priceLineOptions.color).toBe("transparent");
  });

  it("timeframe 변경 시 차트가 재생성되어야 함", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;
    const { rerender } = render(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    const callsBefore = createChartMock.mock.calls.length;

    rerender(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1h"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    // timeframe 변경 시 createChart가 다시 호출됨
    expect(createChartMock.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe("MainChart - 차트 정리 테스트", () => {
  it("컴포넌트 언마운트 시 차트가 제거되어야 함", () => {
    const { unmount } = render(
      <MainChart
        data={mockData}
        probLevels={[]}
        timeframe="1d"
        gridStrokeColor="#666"
        height={500}
        onReady={mockOnReady}
      />,
    );

    unmount();

    expect(mockChart.remove).toHaveBeenCalled();
  });
});

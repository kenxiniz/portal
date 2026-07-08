/**
 * MacdChart.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MacdChart } from "../MacdChart";
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
  LineSeries: "Line",
  HistogramSeries: "Histogram",
  CandlestickSeries: "Candlestick",
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

const mockMacdData = {
  line: [{ time: "2024-01-01" as Time, value: 2.5 }],
  signal: [{ time: "2024-01-01" as Time, value: 2.0 }],
  hist: [{ time: "2024-01-01" as Time, value: 0.5, color: "#26a69a" }],
};

const mockMacdStatus = {
  title: "상승",
  color: "#2e7d32",
  value: 2.5,
};

const mockOnReady = jest.fn();

describe("MacdChart - autoSize 및 리사이징 UX 테스트", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createChart 호출 시 autoSize: true 옵션이 설정되어야 함", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;

    render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    expect(createChartMock).toHaveBeenCalled();
    const options = createChartMock.mock.calls[0][1];
    expect(options.autoSize).toBe(true);
  });

  it("컨테이너 div가 width: 100%와 minWidth: 0을 가져야 함", () => {
    const { container } = render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    const divs = container.querySelectorAll("div");
    const chartDiv = Array.from(divs).find(
      (div) => div.style.width === "100%" && div.style.minWidth === "0",
    );
    expect(chartDiv).toBeInTheDocument();
  });

  it("높이 변경 시 applyOptions가 호출되어야 함", () => {
    const { rerender } = render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    jest.clearAllMocks();

    rerender(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={300}
        onReady={mockOnReady}
      />,
    );

    expect(mockChart.applyOptions).toHaveBeenCalledWith({ height: 300 });
  });

  it("timeScale이 숨겨져 있어야 함 (handleScroll, handleScale false)", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;

    render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    const options = createChartMock.mock.calls[0][1];
    expect(options.timeScale.visible).toBe(false);
    expect(options.handleScroll).toBe(false);
    expect(options.handleScale).toBe(false);
  });
});

describe("MacdChart - MACD 상태 표시 UX 테스트", () => {
  it("MACD 상태 태그가 표시되어야 함", () => {
    render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    expect(screen.getByText(/적응형 모멘텀 상승/i)).toBeInTheDocument();
  });

  it("MACD 상태 태그가 올바른 색상을 가져야 함", () => {
    render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    const tag = screen.getByText(/적응형 모멘텀 상승/i).parentElement;
    expect(tag).toHaveStyle({ backgroundColor: mockMacdStatus.color });
  });

  it("MACD 라인 색상이 상태에 따라 변경되어야 함", () => {
    const mockLineSeries = {
      setData: jest.fn(),
      applyOptions: jest.fn(),
    };

    mockChart.addSeries.mockReturnValueOnce({
      setData: jest.fn(),
      applyOptions: jest.fn(),
    }); // hist
    mockChart.addSeries.mockReturnValueOnce(mockLineSeries); // line
    mockChart.addSeries.mockReturnValueOnce({
      setData: jest.fn(),
      applyOptions: jest.fn(),
    }); // signal

    render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    expect(mockLineSeries.applyOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        color: mockMacdStatus.color,
      }),
    );
  });

  it("MACD 값이 소수점 둘째 자리까지 표시되어야 함", () => {
    const mockLineSeries = {
      setData: jest.fn(),
      applyOptions: jest.fn(),
    };

    mockChart.addSeries.mockReturnValueOnce({
      setData: jest.fn(),
      applyOptions: jest.fn(),
    });
    mockChart.addSeries.mockReturnValueOnce(mockLineSeries);

    render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    const priceFormatCall = mockLineSeries.applyOptions.mock.calls.find(
      (call) => call[0].hasOwnProperty("priceFormat"),
    );
    expect(priceFormatCall).toBeDefined();

    const formatter = priceFormatCall[0].priceFormat.formatter;
    expect(formatter(2.5678)).toBe("2.57");
  });
});

describe("MacdChart - 차트 정리 테스트", () => {
  it("컴포넌트 언마운트 시 차트가 제거되어야 함", () => {
    const { unmount } = render(
      <MacdChart
        data={mockData}
        macdData={mockMacdData}
        macdStatus={mockMacdStatus}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    unmount();

    expect(mockChart.remove).toHaveBeenCalled();
  });
});

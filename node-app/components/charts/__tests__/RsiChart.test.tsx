/**
 * RsiChart.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { RsiChart } from "../RsiChart";
import * as lightweightCharts from "lightweight-charts";
import type { Time } from "lightweight-charts";

const mockChart = {
  addSeries: jest.fn(() => ({
    setData: jest.fn(),
    applyOptions: jest.fn(),
    createPriceLine: jest.fn(() => ({})),
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
    rsi: 45,
  },
  {
    time: "2024-01-02" as Time,
    date: "2024-01-02",
    open: 103,
    high: 107,
    low: 102,
    close: 106,
    volume: 1200,
    color: "#E53935",
    rsi: 75, // 과매수
  },
];

const mockOnReady = jest.fn();

describe("RsiChart - autoSize 및 리사이징 UX 테스트", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createChart 호출 시 autoSize: true 옵션이 설정되어야 함", () => {
    const createChartMock = lightweightCharts.createChart as jest.Mock;

    render(
      <RsiChart
        data={mockData}
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
      <RsiChart
        data={mockData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    // 차트를 감싸는 div (relative wrapper 제외)
    const divs = container.querySelectorAll("div");
    const chartDiv = Array.from(divs).find(
      (div) => div.style.width === "100%" && div.style.minWidth === "0",
    );
    expect(chartDiv).toBeInTheDocument();
  });

  it("높이 변경 시 applyOptions가 호출되어야 함", () => {
    const { rerender } = render(
      <RsiChart
        data={mockData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    jest.clearAllMocks();

    rerender(
      <RsiChart
        data={mockData}
        gridStrokeColor="#666"
        height={300}
        onReady={mockOnReady}
      />,
    );

    expect(mockChart.applyOptions).toHaveBeenCalledWith({ height: 300 });
  });
});

describe("RsiChart - RSI 상태 표시 UX 테스트", () => {
  it("과매수 상태(RSI >= 70)일 때 빨간색 태그가 표시되어야 함", () => {
    render(
      <RsiChart
        data={mockData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    const tag = screen.getByText("과매수");
    expect(tag).toBeInTheDocument();
    expect(tag.parentElement).toHaveStyle({ backgroundColor: "#ef5350" });
  });

  it("과매도 상태(RSI <= 30)일 때 녹색 태그가 표시되어야 함", () => {
    const oversoldData = [
      {
        time: "2024-01-01" as Time,
        date: "2024-01-01",
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000,
        color: "#E53935",
        rsi: 25, // 과매도
      },
    ];

    render(
      <RsiChart
        data={oversoldData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    const tag = screen.getByText("과매도");
    expect(tag).toBeInTheDocument();
    expect(tag.parentElement).toHaveStyle({ backgroundColor: "#2e7d32" });
  });

  it("중립 상태(30 < RSI < 70)일 때 태그가 표시되지 않아야 함", () => {
    const neutralData = [
      {
        time: "2024-01-01" as Time,
        date: "2024-01-01",
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000,
        color: "#E53935",
        rsi: 50, // 중립
      },
    ];

    render(
      <RsiChart
        data={neutralData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    expect(screen.queryByText("과매수")).not.toBeInTheDocument();
    expect(screen.queryByText("과매도")).not.toBeInTheDocument();
  });

  it("과매수/과매도 기준선이 생성되어야 함 (70, 30)", () => {
    const mockCreatePriceLine = jest.fn(() => ({}));
    const mockRsiSeries = {
      setData: jest.fn(),
      applyOptions: jest.fn(),
      createPriceLine: mockCreatePriceLine,
    };

    mockChart.addSeries.mockReturnValueOnce(mockRsiSeries);

    render(
      <RsiChart
        data={mockData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    expect(mockCreatePriceLine).toHaveBeenCalledTimes(2);

    // 70선 (과매수)
    expect(mockCreatePriceLine).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 70,
        color: "red",
        title: "과매수",
      }),
    );

    // 30선 (과매도)
    expect(mockCreatePriceLine).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 30,
        color: "green",
        title: "과매도",
      }),
    );
  });
});

describe("RsiChart - 차트 정리 테스트", () => {
  it("컴포넌트 언마운트 시 차트가 제거되어야 함", () => {
    const { unmount } = render(
      <RsiChart
        data={mockData}
        gridStrokeColor="#666"
        height={200}
        onReady={mockOnReady}
      />,
    );

    unmount();

    expect(mockChart.remove).toHaveBeenCalled();
  });
});

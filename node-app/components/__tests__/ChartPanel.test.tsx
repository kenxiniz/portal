/**
 * ChartPanel.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ChartPanel } from "../ChartPanel";

// Mock StockChartDisplay
jest.mock("../StockChartDisplay", () => ({
  StockChartDisplay: React.forwardRef(function MockStockChartDisplay() {
    return <div>Mocked Chart</div>;
  }),
}));

const mockTickerState = {
  data: [
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
  ],
  signals: [],
  loading: false,
  error: null,
};

describe("ChartPanel - Flexbox 레이아웃 UX 테스트", () => {
  it("최상위 컨테이너가 flex-1과 min-w-0을 가져야 함 (사이드바 리사이징 대응)", () => {
    const { container } = render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={mockTickerState}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    const mainContainer = container.querySelector(".flex-1.min-w-0.min-h-0");
    expect(mainContainer).toBeInTheDocument();
  });

  it("Card 컴포넌트가 flex-1과 min-w-0을 가져야 함", () => {
    const { container } = render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={mockTickerState}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    // Card는 여러 flex 클래스를 가져야 함
    const cards = container.querySelectorAll(
      ".flex.flex-col.flex-1.min-h-0.min-w-0",
    );
    expect(cards.length).toBeGreaterThan(0);
  });

  it("차트 wrapper div가 flex-1과 min-w-0을 가져야 함", () => {
    const { container } = render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={mockTickerState}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    // 차트를 감싸는 div가 올바른 클래스를 가지는지 확인
    const chartWrapper = container.querySelector(
      ".flex-1.min-h-0.min-w-0.flex.flex-col",
    );
    expect(chartWrapper).toBeInTheDocument();
  });

  it("신호 내역이 접혀있을 때 수익률이 표시되어야 함", () => {
    const tickerStateWithSignals = {
      ...mockTickerState,
      signals: [
        {
          date: "2024-01-01",
          type: "BUY" as const,
          price: 100,
          reason: "Test buy",
        },
        {
          date: "2024-01-02",
          type: "SELL" as const,
          price: 106,
          reason: "Test sell",
        },
      ],
    };

    render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={tickerStateWithSignals}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    // 수익률이 접힌 상태에서도 보여야 함
    // "%" 기호가 화면에 있는지 확인
    const percentageElements = screen.queryAllByText(/%/);
    expect(percentageElements.length).toBeGreaterThan(0);
  });

  it("로딩 상태를 올바르게 표시해야 함", () => {
    const loadingState = {
      ...mockTickerState,
      loading: true,
      data: null,
    };

    render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={loadingState}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    expect(screen.getByText(/로딩 중/i)).toBeInTheDocument();
  });

  it("에러 상태를 올바르게 표시해야 함", () => {
    const errorState = {
      ...mockTickerState,
      data: null,
      error: "데이터를 불러올 수 없습니다",
    };

    render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={errorState}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    expect(
      screen.getByText(/차트 데이터를 불러오지 못했습니다/i),
    ).toBeInTheDocument();
  });
});

describe("ChartPanel - 반응형 레이아웃 테스트", () => {
  it("모든 flex container가 올바른 min-width/min-height 설정을 가져야 함", () => {
    const { container } = render(
      <ChartPanel
        symbol="AAPL"
        displayName="Apple Inc."
        tickerState={mockTickerState}
        gridStrokeColor="#666"
        currency="USD"
        timeframe="1d"
        apiType="kisStock"
      />,
    );

    // 모든 flex-1 요소가 min-h-0 또는 min-w-0을 가져야 함
    const flexElements = container.querySelectorAll(".flex-1");
    flexElements.forEach((element) => {
      const hasMinConstraint =
        element.classList.contains("min-h-0") ||
        element.classList.contains("min-w-0");
      expect(hasMinConstraint).toBe(true);
    });
  });
});

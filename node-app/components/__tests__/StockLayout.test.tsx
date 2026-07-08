/**
 * StockLayout.test.tsx
 *
 * 필요한 패키지 설치:
 * npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { StockLayout } from "../StockLayout";

// Mock 하위 컴포넌트
jest.mock("../SymbolSidebar", () => ({
  SymbolSidebar: ({
    isCollapsed,
    onToggleCollapse,
  }: {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
  }) => (
    <div
      data-testid="symbol-sidebar"
      className={isCollapsed ? "collapsed" : "expanded"}
    >
      <button onClick={onToggleCollapse}>Toggle Sidebar</button>
    </div>
  ),
}));

jest.mock("../ChartPanel", () => ({
  ChartPanel: () => <div data-testid="chart-panel">Chart Panel</div>,
}));

const mockSymbols = [
  { id: "AAPL", name: "Apple Inc." },
  { id: "GOOGL", name: "Alphabet Inc." },
];

const mockTickerStates = {
  AAPL: {
    data: [
      {
        date: "2024-01-01",
        open: 100,
        high: 105,
        low: 99,
        close: 103,
        volume: 1000,
      },
    ],
    signals: [],
    loading: false,
    error: null,
  },
  GOOGL: {
    data: [
      {
        date: "2024-01-01",
        open: 200,
        high: 205,
        low: 199,
        close: 203,
        volume: 2000,
      },
    ],
    signals: [],
    loading: false,
    error: null,
  },
};

const mockOnSelectSymbol = jest.fn();
const mockOnTimeframeChange = jest.fn();

describe("StockLayout - 레이아웃 구조 UX 테스트", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("전체 레이아웃이 h-screen으로 화면 전체를 차지해야 함", () => {
    const { container } = render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const layout = container.querySelector(".h-screen");
    expect(layout).toBeInTheDocument();
  });

  it("메인 컨텐츠 영역이 flex-row로 사이드바와 차트를 나란히 배치해야 함", () => {
    const { container } = render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    // md:flex-row 클래스를 가진 요소 확인
    const mainContent = container.querySelector(".md\\:flex-row");
    expect(mainContent).toBeInTheDocument();
  });

  it("사이드바와 차트 패널이 모두 렌더링되어야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    expect(screen.getByTestId("symbol-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("chart-panel")).toBeInTheDocument();
  });
});

describe("StockLayout - 사이드바 토글 UX 테스트", () => {
  it("사이드바가 초기에는 펼쳐진 상태여야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const sidebar = screen.getByTestId("symbol-sidebar");
    expect(sidebar).toHaveClass("expanded");
  });

  it("토글 버튼 클릭 시 사이드바가 접혀야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const toggleButton = screen.getByText("Toggle Sidebar");
    fireEvent.click(toggleButton);

    const sidebar = screen.getByTestId("symbol-sidebar");
    expect(sidebar).toHaveClass("collapsed");
  });

  it("접힌 상태에서 다시 토글하면 펼쳐져야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const toggleButton = screen.getByText("Toggle Sidebar");

    // 접기
    fireEvent.click(toggleButton);
    expect(screen.getByTestId("symbol-sidebar")).toHaveClass("collapsed");

    // 펼치기
    fireEvent.click(toggleButton);
    expect(screen.getByTestId("symbol-sidebar")).toHaveClass("expanded");
  });
});

describe("StockLayout - Timeframe 버튼 UX 테스트", () => {
  it("세 개의 timeframe 버튼이 렌더링되어야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    expect(screen.getByText("일봉")).toBeInTheDocument();
    expect(screen.getByText("1시간 봉")).toBeInTheDocument();
    expect(screen.getByText("15분 봉")).toBeInTheDocument();
  });

  it("현재 선택된 timeframe 버튼이 활성 스타일을 가져야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const dailyButton = screen.getByText("일봉");
    expect(dailyButton).toHaveClass("bg-white", "dark:bg-slate-600");
  });

  it("timeframe 버튼 클릭 시 onTimeframeChange가 호출되어야 함", () => {
    render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const hourButton = screen.getByText("1시간 봉");
    fireEvent.click(hourButton);

    expect(mockOnTimeframeChange).toHaveBeenCalledWith("1h");
  });
});

describe("StockLayout - 반응형 레이아웃 테스트", () => {
  it("모바일에서는 flex-col, 데스크톱에서는 md:flex-row 클래스를 가져야 함", () => {
    const { container } = render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const mainContent = container.querySelector(".flex-col.md\\:flex-row");
    expect(mainContent).toBeInTheDocument();
  });

  it("overflow-hidden 클래스로 스크롤을 방지해야 함", () => {
    const { container } = render(
      <StockLayout
        title="미국 주식"
        apiType="kisStock"
        symbols={mockSymbols}
        selectedSymbol="AAPL"
        tickerStates={mockTickerStates}
        onSelectSymbol={mockOnSelectSymbol}
        timeframe="1d"
        onTimeframeChange={mockOnTimeframeChange}
        gridStrokeColor="#666"
        currency="USD"
      />,
    );

    const mainContent = container.querySelector(".overflow-hidden");
    expect(mainContent).toBeInTheDocument();
  });
});

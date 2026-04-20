/* components/charts/plugins/GaussianBoxPrimitive.ts */
import {
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  IChartApi,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";

// Extend TrendBox to include the raw prices during that period for statistical calculation
export interface TrendBox {
  startTime: Time;
  endTime: Time;
  topPrice: number;
  bottomPrice: number;
  isUptrend: boolean;
  prices: number[]; // Store close prices of the segment
}

class GaussianBoxRenderer implements IPrimitivePaneRenderer {
  private _boxes: TrendBox[];
  private _series: ISeriesApi<"Candlestick">;
  private _chart: IChartApi;

  constructor(
    boxes: TrendBox[],
    series: ISeriesApi<"Candlestick">,
    chart: IChartApi,
  ) {
    this._boxes = boxes;
    this._series = series;
    this._chart = chart;
  }

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();

      const timeScale = this._chart.timeScale();

      for (const box of this._boxes) {
        if (!box.endTime || box.prices.length < 2) continue;

        const startX = timeScale.timeToCoordinate(box.startTime);
        const endX = timeScale.timeToCoordinate(box.endTime);
        const topY = this._series.priceToCoordinate(box.topPrice);
        const bottomY = this._series.priceToCoordinate(box.bottomPrice);

        if (
          startX === null ||
          endX === null ||
          topY === null ||
          bottomY === null
        )
          continue;

        const width = Math.max(endX - startX, 1);
        const height = bottomY - topY; // bottomY is greater than topY in canvas coordinates

        // 1. Draw Background and Box Border
        ctx.fillStyle = box.isUptrend
          ? "rgba(38, 166, 154, 0.1)"
          : "rgba(239, 83, 80, 0.1)";
        ctx.fillRect(startX, topY, width, height);

        ctx.strokeStyle = box.isUptrend
          ? "rgba(38, 166, 154, 0.5)"
          : "rgba(239, 83, 80, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(startX, topY, width, height);

        // 2. Statistical Calculation (Mean and Standard Deviation)
        const n = box.prices.length;
        const mean = box.prices.reduce((a, b) => a + b, 0) / n;
        const variance =
          box.prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        const sd = Math.sqrt(variance);

        // Define Z-scores for probability intervals
        // Z=1 (approx 68% data within), Z=1.645 (approx 90% data within)
        const levels = [
          { z: 1.645, label: "90%", title: "+90% (Extreme Resist)" },
          { z: 1.0, label: "68%", title: "+68% (Resist)" },
          { z: 0, label: "Mean", title: "Mean (POC)" },
          { z: -1.0, label: "68%", title: "-68% (Support)" },
          { z: -1.645, label: "90%", title: "-90% (Extreme Support)" },
        ];

        // Draw statistical lines only if box width is enough to be readable
        if (width > 60) {
          ctx.font = "10px sans-serif";
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";

          const textColor = box.isUptrend
            ? "rgba(0, 105, 92, 0.9)"
            : "rgba(183, 28, 28, 0.9)";
          const lineColor = box.isUptrend
            ? "rgba(38, 166, 154, 0.6)"
            : "rgba(239, 83, 80, 0.6)";

          levels.forEach((level) => {
            const priceLevel = mean + level.z * sd;

            // Only draw lines that fall inside the box boundaries to keep it clean
            if (priceLevel <= box.topPrice && priceLevel >= box.bottomPrice) {
              const y = this._series.priceToCoordinate(priceLevel);
              if (y !== null) {
                // Draw dashed line
                ctx.beginPath();
                ctx.setLineDash([2, 4]);
                ctx.strokeStyle = level.z === 0 ? textColor : lineColor; // Mean line is darker
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();

                // Draw probability text tag
                ctx.fillStyle = textColor;
                const tagText = `${level.label} (${priceLevel.toFixed(2)})`;
                ctx.fillText(tagText, endX - 4, y - 6);
              }
            }
          });
          ctx.setLineDash([]); // Reset dash
        }
      }

      ctx.restore();
    });
  }
}

class GaussianBoxView implements IPrimitivePaneView {
  private _renderer: GaussianBoxRenderer;
  private _series: ISeriesApi<"Candlestick">;
  private _chart: IChartApi;

  constructor(
    boxes: TrendBox[],
    series: ISeriesApi<"Candlestick">,
    chart: IChartApi,
  ) {
    this._series = series;
    this._chart = chart;
    this._renderer = new GaussianBoxRenderer(boxes, series, chart);
  }

  zOrder(): "bottom" | "normal" | "top" {
    return "normal"; // Raised to normal to overlay lines clearly on candles
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }

  updateBoxes(boxes: TrendBox[]) {
    this._renderer = new GaussianBoxRenderer(boxes, this._series, this._chart);
  }
}

export class GaussianBoxPrimitive implements ISeriesPrimitive<Time> {
  private _boxes: TrendBox[];
  private _view: GaussianBoxView | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<"Candlestick"> | null = null;

  constructor(boxes: TrendBox[]) {
    this._boxes = boxes;
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._requestUpdate = param.requestUpdate;
    this._chart = param.chart as unknown as IChartApi;
    this._series = param.series as ISeriesApi<"Candlestick">;

    this._view = new GaussianBoxView(this._boxes, this._series, this._chart);
    this._requestUpdate();
  }

  detached() {
    this._view = null;
    this._requestUpdate = null;
    this._chart = null;
    this._series = null;
  }

  paneViews() {
    return this._view ? [this._view] : [];
  }

  updateAllViews() {}

  setData(boxes: TrendBox[]) {
    this._boxes = boxes;
    if (this._view && this._requestUpdate && this._chart && this._series) {
      this._view.updateBoxes(boxes);
      this._requestUpdate();
    }
  }
}

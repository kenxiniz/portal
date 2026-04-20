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
import { TrendBox } from "@/lib/charts/indicators";

// Canvas renderer for drawing rectangles behind the candlesticks
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

  // Use TypeScript utility type to automatically match the lightweight-charts v4 signature
  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]) {
    // In v4, we must explicitly request the coordinate space (Media = CSS pixels)
    // to correctly align with timeToCoordinate and priceToCoordinate.
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();

      // Access timeScale directly from the injected chart instance
      const timeScale = this._chart.timeScale();

      for (const box of this._boxes) {
        if (!box.endTime) continue;

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
        const height = bottomY - topY;

        // Draw box fill
        ctx.fillStyle = box.isUptrend
          ? "rgba(38, 166, 154, 0.15)"
          : "rgba(239, 83, 80, 0.15)";
        ctx.fillRect(startX, topY, width, height);

        // Draw box stroke
        ctx.strokeStyle = box.isUptrend
          ? "rgba(38, 166, 154, 0.4)"
          : "rgba(239, 83, 80, 0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(startX, topY, width, height);
      }

      ctx.restore();
    });
  }
}

// Pane view linking the renderer to the primitive lifecycle
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
    return "bottom";
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

  // Bind to chart instance lifecycle using the strictly typed parameter
  attached(param: SeriesAttachedParameter<Time>) {
    this._requestUpdate = param.requestUpdate;
    this._chart = param.chart as unknown as IChartApi; // Cast to bypass strict base type checking
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

  // Allow dynamic updates to box data
  setData(boxes: TrendBox[]) {
    this._boxes = boxes;
    if (this._view && this._requestUpdate && this._chart && this._series) {
      this._view.updateBoxes(boxes);
      this._requestUpdate();
    }
  }
}

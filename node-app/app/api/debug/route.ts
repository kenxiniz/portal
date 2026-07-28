import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    chartBarCount: process.env.NEXT_PUBLIC_CHART_BAR_COUNT || "100",
    timestamp: new Date().toISOString(),
  });
}

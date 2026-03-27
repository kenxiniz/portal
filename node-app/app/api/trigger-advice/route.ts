/* app/api/trigger-advice/route.ts */

import { NextResponse } from "next/server";
// Re-confirming the export exists in lib/scheduler/index.ts
import { generateDailyAdvice } from "@/lib/scheduler";

export async function POST() {
  console.log("[Trigger] Manual trigger received for daily advice generation.");

  try {
    // Fire and forget: Do not 'await' as this process takes ~1 min per ticker due to rate limits.
    // The inner function handles its own concurrency check (isAdviceRunning).
    generateDailyAdvice().catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        "[Trigger] Background advice generation task failed:",
        errorMessage,
      );
    });

    return NextResponse.json(
      {
        success: true,
        message:
          "Advice generation task has been successfully queued in the background.",
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      "[Trigger] Critical failure during advice trigger sequence:",
      errorMessage,
    );

    return NextResponse.json(
      { error: "Internal Server Error occurred while triggering advice." },
      { status: 500 },
    );
  }
}

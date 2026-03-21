/* app/api/trigger-advice/route.ts */

import { NextResponse } from "next/server";
import { generateDailyAdvice } from "@/lib/scheduler";

export async function POST() {
  try {
    // Trigger advice generation in the background (fire and forget)
    // We don't await this because it takes a long time (1 min per stock)
    generateDailyAdvice().catch((error) => {
      console.error("Manual advice generation failed:", error);
    });

    return NextResponse.json(
      { message: "Advice generation triggered successfully." },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to trigger advice generation:", error);
    return NextResponse.json(
      { error: "Failed to trigger advice generation." },
      { status: 500 },
    );
  }
}

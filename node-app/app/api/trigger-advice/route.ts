/* app/api/trigger-advice/route.ts */

import { NextResponse } from "next/server";
// This path refers to lib/scheduler/index.ts
import { generateDailyAdvice } from "@/lib/scheduler";

export async function POST() {
  try {
    // Trigger advice generation in the background (fire and forget)
    // No await here because it takes approx. 1 min per stock
    generateDailyAdvice().catch((error) => {
      console.error("Manual background advice generation failed:", error);
    });

    return NextResponse.json(
      { message: "Advice generation triggered successfully." },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to trigger advice generation:", error);
    return NextResponse.json(
      { error: "Internal Server Error during advice trigger." },
      { status: 500 },
    );
  }
}

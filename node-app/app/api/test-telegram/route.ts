/* app/api/test-telegram/route.ts */
import { NextResponse } from "next/server";
// [FIXED] Updated import to use the new separated long-term service
import { TelegramLongTermService } from "@/lib/scheduler/telegramLongTermService";
import { sendDailyStockSignals } from "@/lib/scheduler/jobs/stock";

export async function GET() {
  console.log("[Test Telegram] Initiating manual trigger for stock signals.");

  try {
    // [FIXED] Instantiate the new long-term service
    const telegramService = new TelegramLongTermService();

    console.log("[Test Telegram] Executing sendDailyStockSignals manually...");
    // Execute the actual stock checking and notification logic
    await sendDailyStockSignals(telegramService);

    console.log("[Test Telegram] Manual stock signal notification completed.");
    return NextResponse.json(
      {
        success: true,
        message: "Stock signals triggered and sent to Telegram successfully.",
      },
      { status: 200 },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      "[Test Telegram] Failed to execute manual stock notification:",
      errorMessage,
    );

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}

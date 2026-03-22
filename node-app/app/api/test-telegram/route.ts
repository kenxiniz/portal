import { NextResponse } from "next/server";
// Adjust the import paths based on your actual directory structure
import { TelegramNotificationService } from "@/lib/scheduler/telegramService";
import { sendDailyStockSignals } from "@/lib/scheduler/jobs/stock";

export async function GET() {
  console.log("[Test Telegram] Initiating manual trigger for stock signals.");

  try {
    const telegramService = new TelegramNotificationService();

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

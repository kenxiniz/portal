/* lib/scheduler/jobs/lotto.ts */
import axios from "axios";
import fs from "fs/promises";
import { schedulerConfig } from "../config";
// [FIXED] Updated import to use the new separated long-term service
import { TelegramLongTermService } from "../telegramLongTermService";
import { getDrawNoForDate } from "../../lottoUtils";
import { LottoWeek } from "@/types/lotto";

/**
 * Trigger API to update winning numbers in the background
 */
export async function updateLottoWinningNumbers(): Promise<void> {
  await axios.get(
    `${schedulerConfig.apiBaseUrl}/api/lotto/update-winning-numbers`,
  );
}

/**
 * Send generated lotto numbers to Telegram
 * @param telegramService Instance of TelegramLongTermService
 */
export async function sendDailyLottoNumbers(
  telegramService: TelegramLongTermService,
): Promise<void> {
  const today = new Date();

  // Only proceed on Fridays
  if (today.getDay() !== 5) {
    console.log("Today is not Friday, skipping daily lotto number dispatch.");
    return;
  }

  try {
    const lottoDbRaw = await fs.readFile(schedulerConfig.lottoDbPath, "utf8");
    const lottoDb: Record<string, LottoWeek> = JSON.parse(lottoDbRaw);

    const currentDrawNo = getDrawNoForDate(new Date());
    const currentWeekData = Object.values(lottoDb).find(
      (w) => w.drawNo === currentDrawNo,
    );

    if (
      currentWeekData?.generatedSets &&
      currentWeekData.generatedSets.length > 0
    ) {
      console.log(
        `[Lotto Job] Sending ${currentWeekData.generatedSets.length} generated sets for draw ${currentDrawNo}.`,
      );

      const messageFn = telegramService.createLottoSetsMessage(currentDrawNo);

      await telegramService.notifyInChunks(
        messageFn,
        currentWeekData.generatedSets,
        schedulerConfig.notificationChunkSize,
      );
    } else {
      console.log(
        `[Lotto Job] No generated numbers found for draw ${currentDrawNo}, skipping dispatch.`,
      );
    }
  } catch (error) {
    console.error(
      "[Lotto Job] Failed to read lotto DB or send message:",
      error,
    );
  }
}

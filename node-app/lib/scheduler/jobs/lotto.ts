import axios from "axios";
import fs from "fs/promises";
import { schedulerConfig } from "../config";
import { KakaoNotificationService } from "../kakaoService";
import { getDrawNoForDate } from "../../lottoUtils";
import { LottoWeek } from "@/types/lotto";

export async function updateLottoWinningNumbers(): Promise<void> {
  await axios.get(`${schedulerConfig.apiBaseUrl}/api/lotto/update-winning-numbers`);
}

export async function sendDailyLottoNumbers(kakaoService: KakaoNotificationService): Promise<void> {
  const today = new Date();
  if (today.getDay() !== 5) {
    console.log("Today is not Friday, skipping daily lotto number dispatch.");
    return;
  }

  const lottoDb: Record<string, LottoWeek> = JSON.parse(
    await fs.readFile(schedulerConfig.lottoDbPath, "utf8"),
  );
  const currentDrawNo = getDrawNoForDate(new Date());
  const currentWeekData = Object.values(lottoDb).find((w) => w.drawNo === currentDrawNo);

  if (currentWeekData?.generatedSets && currentWeekData.generatedSets.length > 0) {
    console.log(`Sending ${currentWeekData.generatedSets.length} generated sets for draw ${currentDrawNo}.`);
    const templateFn = kakaoService.createLottoSetsTemplate(currentDrawNo);
    await kakaoService.notifyInChunks(
      templateFn,
      currentWeekData.generatedSets,
      schedulerConfig.notificationChunkSize,
    );
  } else {
    console.log(`No generated numbers found for draw ${currentDrawNo}, skipping dispatch.`);
  }
}

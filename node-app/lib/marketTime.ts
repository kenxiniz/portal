/* lib/marketTime.ts */

export function isMarketOpen(market: "KR" | "US"): boolean {
  const now = new Date();
  const timeZone = market === "KR" ? "Asia/Seoul" : "America/New_York";

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value || "0",
    10,
  );

  if (day === "Sat" || day === "Sun") return false;

  const timeInt = hour * 100 + minute;

  // KR: 한국 정규장 (09:00 ~ 15:30)
  // US: 뉴욕 프리마켓 시작(04:00) ~ 애프터마켓 종료(20:00)
  return market === "KR"
    ? timeInt >= 900 && timeInt <= 1530
    : timeInt >= 400 && timeInt <= 2000; // 💡 930->400, 1600->2000으로 수정됨
}

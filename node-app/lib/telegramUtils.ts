export async function sendTelegramMessage(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error(
      "[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables.",
    );
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    console.log("[Telegram] Attempting to send message to Telegram bot.");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `[Telegram] HTTP request failed with status: ${response.status}`,
      );
    }

    console.log("[Telegram] Message sent successfully.");
  } catch (error) {
    console.error("[Telegram] Failed to send message.", error);
  }
}

/* /lib/telegramUtils.ts */

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
    console.log(`[Telegram] Attempting to send message to chat ${chatId}.`);

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
      // Extract raw text to expose exact Telegram API rejection reason
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status} - ${errorText}`);
    }

    console.log("[Telegram] Message sent successfully.");
  } catch (error: unknown) {
    // Log separately to prevent object serialization issues
    console.error(
      `[Telegram] Failed to send message to chat ${chatId}. Reason:`,
    );

    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
  }
}

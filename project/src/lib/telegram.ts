export async function sendTelegramMessage(
  chatId: string,
  text: string
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) return;

  await fetch(
    `https://api.telegram.org/bot8597414915:AAGXkC2rP9AxqdZUuJwIf4Q1BbACNKjDc4Q/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );
}
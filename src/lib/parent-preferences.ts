import { prisma } from "./prisma";
export const preferenceButtons = [
  [
    { text: "Русский", callback_data: "reports_language:RU" },
    { text: "O‘zbekcha", callback_data: "reports_language:UZ" },
    { text: "RU + UZ", callback_data: "reports_language:BOTH" },
  ],
  [
    { text: "Сводка: включить / Yoqish", callback_data: "reports_weekly:on" },
    { text: "Отключить / O‘chirish", callback_data: "reports_weekly:off" },
  ],
];
export async function setParentPreference(chatId: bigint, command: string) {
  let data;
  if (command.startsWith("reports_language:")) {
    const reportLanguage = command.slice("reports_language:".length);
    if (!["RU", "UZ", "BOTH"].includes(reportLanguage)) return 0;
    data = { reportLanguage };
  } else if (
    command === "reports_weekly:on" ||
    command === "reports_weekly:off"
  )
    data = { weeklyReports: command === "reports_weekly:on" };
  else return 0;
  const result = await prisma.parent.updateMany({
    where: { telegramId: chatId, student: { archivedAt: null } },
    data,
  });
  return result.count;
}

import { NextResponse } from "next/server";
import { Api } from "node-telegram-bot-api";
import { getActiveTasks, updateTask, STATUS } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const api = new Api(process.env.TELEGRAM_BOT_TOKEN);

function nowInParts() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  return { date, time, epoch: now.getTime() };
}

function taskEpoch(task) {
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  const localDateTime = new Date(`${task.date}T${task.time}:00Z`);
  return localDateTime.getTime() - IST_OFFSET_MINUTES * 60 * 1000;
}

export async function GET() {
  const { epoch: nowEpoch } = nowInParts();
  const tasks = await getActiveTasks();
  const results = [];

  for (const task of tasks) {
    const startEpoch = taskEpoch(task);
    const endEpoch = startEpoch + task.timerMinutes * 60 * 1000;

    if (!task.timerStarted && nowEpoch >= startEpoch) {
      await updateTask(task.id, { timerStarted: true });
      await api.sendMessage({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `⏱️ ${task.title} — ${task.timerMinutes} min. Go.`,
      });
      results.push(`${task.id}: timer started`);
      continue;
    }

    if (task.timerStarted && !task.completionAsked && nowEpoch >= endEpoch) {
      await updateTask(task.id, { completionAsked: true });
      await api.sendMessage({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `⏰ ${task.title} — time's up.\n\nDone: 1 ${task.seq}\nDidn't: 2 ${task.seq}\nCouldn't: 3 ${task.seq}`,
      });
      results.push(`${task.id}: completion asked`);
    }
  }

  return NextResponse.json({ checked: tasks.length, results });
}
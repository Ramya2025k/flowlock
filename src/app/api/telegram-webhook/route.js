import { NextResponse } from "next/server";
import { Api } from "node-telegram-bot-api";
import { updateTask, STATUS } from "@/lib/tasks";

const api = new Api(process.env.TELEGRAM_BOT_TOKEN);

export async function POST(request) {
  const body = await request.json();
  const text = body?.message?.text;

  if (!text) {
    return NextResponse.json({ ok: true });
  }

  // Handle: "REASON task_123 my actual reason here"
  const reasonMatch = text.match(/^REASON\s+(task_\d+)\s+(.+)$/i);
  if (reasonMatch) {
    const [, taskId, reason] = reasonMatch;
    await updateTask(taskId, { reason, awaitingReason: false });
    await api.sendMessage({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: `Noted. That reason's saved — don't let it repeat.`,
    });
    return NextResponse.json({ ok: true });
  }

  // Handle: "DONE task_123" / "DIDNT task_123" / "COULDNT task_123"
  const match = text.match(/^(DONE|DIDNT|COULDNT)\s+(task_\d+)$/i);

  if (!match) {
    await api.sendMessage({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: `Didn't understand that. Reply like: DONE task_123`,
    });
    return NextResponse.json({ ok: true });
  }

  const [, action, taskId] = match;
  const statusMap = {
    DONE: STATUS.DONE,
    DIDNT: STATUS.DIDNT,
    COULDNT: STATUS.COULDNT,
  };
  const status = statusMap[action.toUpperCase()];

  if (status === STATUS.DONE) {
    await updateTask(taskId, { status });
    await api.sendMessage({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: `✅ Nice. Marked done.`,
    });
  } else {
    await updateTask(taskId, { status, awaitingReason: true });
    const scoldLines = [
      "Not good. Why didn't you do it?",
      "Everyone else is getting better. What happened here?",
      "That's on you. What's the reason?",
    ];
    const line = scoldLines[Math.floor(Math.random() * scoldLines.length)];
    await api.sendMessage({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: `${line}\n\nReply with: REASON ${taskId} <your reason>`,
    });
  }

  return NextResponse.json({ ok: true });
}
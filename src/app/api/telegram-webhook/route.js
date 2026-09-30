import { NextResponse } from "next/server";
import { Api } from "node-telegram-bot-api";
import { updateTask, getTaskBySeq, getTaskAwaitingReason, STATUS } from "@/lib/tasks";

const api = new Api(process.env.TELEGRAM_BOT_TOKEN);

export async function POST(request) {
  const body = await request.json();
  const text = body?.message?.text?.trim();

  if (!text) {
    return NextResponse.json({ ok: true });
  }

  // "1 4" / "2 4" / "3 4" — action code + task seq number
  const actionMatch = text.match(/^([123])\s+(\d+)$/);

  if (actionMatch) {
    const [, code, seqStr] = actionMatch;
    const seq = Number(seqStr);
    const task = await getTaskBySeq(seq);

    if (!task) {
      await api.sendMessage({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `Couldn't find task #${seq}.`,
      });
      return NextResponse.json({ ok: true });
    }

    if (code === "1") {
      await updateTask(task.id, { status: STATUS.DONE });
      await api.sendMessage({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `✅ Nice. Marked done.`,
      });
    } else {
      const status = code === "2" ? STATUS.DIDNT : STATUS.COULDNT;
      await updateTask(task.id, { status, awaitingReason: true });
      const scoldLines = [
        "Not good. Why didn't you do it?",
        "Everyone else is getting better. What happened here?",
        "That's on you. What's the reason?",
      ];
      const line = scoldLines[Math.floor(Math.random() * scoldLines.length)];
      await api.sendMessage({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: `${line}\n\nJust reply with your reason.`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Free-text reason — only applies if some task is actually waiting on one
  const pendingReasonTask = await getTaskAwaitingReason();
  if (pendingReasonTask) {
    await updateTask(pendingReasonTask.id, { reason: text, awaitingReason: false });
    await api.sendMessage({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: `Noted. That reason's saved — don't let it repeat.`,
    });
    return NextResponse.json({ ok: true });
  }

  await api.sendMessage({
    chat_id: process.env.TELEGRAM_CHAT_ID,
    text: `Didn't understand that. Reply with "1 <number>", "2 <number>", or "3 <number>".`,
  });
  return NextResponse.json({ ok: true });
}
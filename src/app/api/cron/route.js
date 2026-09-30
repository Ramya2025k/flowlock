import { NextResponse } from "next/server";
import { getActiveTasks, updateTask } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds this route may run (check your Vercel plan's limit)

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TICK_MS = 1000; // edit every 1s; raise to 2000 or 5000 if Telegram blocks you
const LIVE_BUDGET_MS = 50 * 1000; // stop live ticking after 50s so the function isn't killed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(method, payload) {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json();
  if (!data.ok && data.error_code === 429) {
    // Telegram says slow down: wait as long as it asks
    await sleep((data.parameters?.retry_after ?? 1) * 1000);
  }
  return data;
}

function taskEpoch(task) {
  const IST_OFFSET_MINUTES = 5 * 60 + 30;
  const localDateTime = new Date(`${task.date}T${task.time}:00Z`);
  return localDateTime.getTime() - IST_OFFSET_MINUTES * 60 * 1000;
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function countdownText(task, leftMs, totalMs) {
  const filled = Math.min(10, Math.max(0, Math.round(((totalMs - leftMs) / totalMs) * 10)));
  const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
  return `⏱️ ${task.title}\n${bar}\n⏳ ${fmt(leftMs)} left`;
}

export async function GET(request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const tasks = await getActiveTasks();
  const results = [];
  let liveUsed = false; // only one task gets the every-second countdown per call

  for (const task of tasks) {
    const startEpoch = taskEpoch(task);
    const totalMs = task.timerMinutes * 60 * 1000;
    const endEpoch = startEpoch + totalMs;

    // 1. Start: send the countdown message and remember its id
    if (!task.timerStarted && Date.now() >= startEpoch) {
      const sent = await tg("sendMessage", {
        chat_id: CHAT_ID,
        text: countdownText(task, endEpoch - Date.now(), totalMs),
      });
      const messageId = sent?.result?.message_id ?? null;
      await updateTask(task.id, { timerStarted: true, timerMessageId: messageId });
      task.timerStarted = true;
      task.timerMessageId = messageId;
      results.push(`${task.id}: timer started`);
    }

    if (!task.timerStarted || task.completionAsked) continue;
           if (!task.timerMessageId && Date.now() < endEpoch) {
         const sent = await tg("sendMessage", {
           chat_id: CHAT_ID,
           text: countdownText(task, endEpoch - Date.now(), totalMs),
         });
         task.timerMessageId = sent?.result?.message_id ?? null;
         await updateTask(task.id, { timerMessageId: task.timerMessageId });
       }

    // 2. Running: tick the same message
    if (!liveUsed && task.timerMessageId) {
      liveUsed = true;
      while (Date.now() < endEpoch && Date.now() - startedAt < LIVE_BUDGET_MS) {
        await sleep(TICK_MS);
        const left = endEpoch - Date.now();
        if (left <= 0) break;
               const r = await tg("editMessageText", {
          chat_id: CHAT_ID,
          message_id: task.timerMessageId,
          text: countdownText(task, left, totalMs),
        });
        if (!r.ok) {
          results.push(`edit failed: ${r.description}`);
          break;
        }
      }
      results.push(`${task.id}: live countdown ran`);
    } else if (task.timerMessageId && Date.now() < endEpoch) {
      // other running tasks: one edit per call
      await tg("editMessageText", {
        chat_id: CHAT_ID,
        message_id: task.timerMessageId,
        text: countdownText(task, endEpoch - Date.now(), totalMs),
      });
      continue;
    }

    // 3. Finished: close the countdown, then ask how it went
    if (Date.now() >= endEpoch) {
      if (task.timerMessageId) {
        await tg("editMessageText", {
          chat_id: CHAT_ID,
          message_id: task.timerMessageId,
          text: `⏰ ${task.title} — time's up.`,
        });
      }
      await updateTask(task.id, { completionAsked: true });
      await tg("sendMessage", {
        chat_id: CHAT_ID,
        text: `⏰ ${task.title} — time's up.\n\nDone: 1 ${task.seq}\nDidn't: 2 ${task.seq}\nCouldn't: 3 ${task.seq}`,
      });
      results.push(`${task.id}: completion asked`);
    }
  }

  return NextResponse.json({ checked: tasks.length, results });
}
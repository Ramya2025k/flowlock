import { NextResponse } from "next/server";
import { getActiveTasks, updateTask, ensureDefaultsForDate, istDate } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TICK_MS = 1000; // countdown edit interval
const LIVE_BUDGET_MS = 50 * 1000; // stop live ticking after 50s
const GRACE_MS = 10 * 60 * 1000; // a missed start older than this is skipped silently
const STALE_MS = 12 * 60 * 60 * 1000; // ignore tasks that ended more than 12h ago

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
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = [];

  // 0. Make sure today's default tasks exist
  const created = await ensureDefaultsForDate(istDate());
  if (created) results.push(`defaults created: ${created}`);

  const tasks = await getActiveTasks();
  const timerTasks = [];

  // PASS 1: heads-up notifications and no-timer tasks (fast, never blocks)
  for (const task of tasks) {
    const now = Date.now();
    const startEpoch = taskEpoch(task);
    const hasTimer = Number(task.timerMinutes) > 0;
    const endEpoch = startEpoch + (hasTimer ? task.timerMinutes * 60 * 1000 : 0);
    if (now > endEpoch + STALE_MS) continue;

    // Heads-up before the task time
    if (!task.notified) {
      const notifyMs = Number(task.notifyMinutes ?? 3) * 60 * 1000;
      if (notifyMs > 0 && now < startEpoch && now >= startEpoch - notifyMs) {
        const mins = Math.max(1, Math.ceil((startEpoch - now) / 60000));
        await tg("sendMessage", {
          chat_id: CHAT_ID,
          text: `🔔 Coming up in ${mins} min: ${task.title} (${task.time})`,
        });
        await updateTask(task.id, { notified: true });
        task.notified = true;
        results.push(`${task.id}: heads-up sent`);
      } else if (now >= startEpoch) {
        await updateTask(task.id, { notified: true });
        task.notified = true;
      }
    }

    if (hasTimer) {
      timerTasks.push(task);
      continue;
    }

    // No timer: announce at the task time and wait for Done
    if (!task.startAnnounced && now >= startEpoch) {
      if (now - startEpoch <= GRACE_MS) {
        await tg("sendMessage", {
          chat_id: CHAT_ID,
          text: `▶️ Now: ${task.title}\n\nDone: 1 ${task.seq}`,
        });
        results.push(`${task.id}: announced`);
      }
      await updateTask(task.id, { startAnnounced: true });
    }
  }

  // PASS 2: timer tasks (start message, live countdown, finish)
  let liveUsed = false;
  for (const task of timerTasks) {
    const startEpoch = taskEpoch(task);
    const totalMs = task.timerMinutes * 60 * 1000;
    const endEpoch = startEpoch + totalMs;

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
        if (!r.ok && !String(r.description).includes("not modified")) {
          results.push(`edit failed: ${r.description}`);
          break;
        }
      }
      results.push(`${task.id}: live countdown ran`);
    } else if (task.timerMessageId && Date.now() < endEpoch) {
      await tg("editMessageText", {
        chat_id: CHAT_ID,
        message_id: task.timerMessageId,
        text: countdownText(task, endEpoch - Date.now(), totalMs),
      });
      continue;
    }

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
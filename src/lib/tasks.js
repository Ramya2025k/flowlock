import { redis } from "./redis";
import { DEFAULT_TASKS } from "./defaults";

export const CATEGORIES = ["Study", "Work", "Growth", "Health", "Personal"];
export const STATUS = {
  PENDING: "pending",
  DONE: "done",
  DIDNT: "didnt",
  COULDNT: "couldnt",
};

// Today's date in India time (the server runs in UTC)
export function istDate(now = Date.now()) {
  return new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function createTask(task) {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const seq = await redis.incr("task:seq:counter");

  const fullTask = {
    id,
    seq,
    title: task.title,
    category: task.category,
    date: task.date,
    time: task.time,
    timerMinutes: Number(task.timerMinutes) || 0, // 0 = no timer
    notifyMinutes:
      task.notifyMinutes === undefined || task.notifyMinutes === null
        ? 3
        : Number(task.notifyMinutes), // 0 = no heads-up
    isDefault: Boolean(task.isDefault),
    defaultKey: task.defaultKey || null,
    status: STATUS.PENDING,
    reason: null,
    notified: false,
    startAnnounced: false,
    timerStarted: false,
    completionAsked: false,
    awaitingReason: false,
    createdAt: Date.now(),
  };

  await redis.set(`task:${id}`, fullTask);
  await redis.set(`task:seqmap:${seq}`, id);
  await redis.sadd(`tasks:byDate:${task.date}`, id);
  await redis.sadd(`tasks:allActive`, id);

  return fullTask;
}

// Create today's copies of the default tasks (safe to call every minute)
export async function ensureDefaultsForDate(date) {
  let created = 0;
  for (const d of DEFAULT_TASKS) {
    const claimed = await redis.set(`default:${date}:${d.key}`, "1", {
      nx: true,
      ex: 60 * 60 * 48,
    });
    if (!claimed) continue; // already created for this date
    await createTask({
      title: d.title,
      category: d.category,
      date,
      time: d.time,
      timerMinutes: 0,
      notifyMinutes: d.notifyMinutes,
      isDefault: true,
      defaultKey: d.key,
    });
    created++;
  }
  return created;
}

export async function getTaskBySeq(seq) {
  const id = await redis.get(`task:seqmap:${seq}`);
  if (!id) return null;
  return redis.get(`task:${id}`);
}

export async function getTasksByDate(date) {
  const ids = await redis.smembers(`tasks:byDate:${date}`);
  if (!ids || ids.length === 0) return [];
  const tasks = await Promise.all(ids.map((id) => redis.get(`task:${id}`)));
  return tasks.filter(Boolean);
}

export async function getActiveTasks() {
  const ids = await redis.smembers(`tasks:allActive`);
  if (!ids || ids.length === 0) return [];
  const tasks = await Promise.all(ids.map((id) => redis.get(`task:${id}`)));
  return tasks.filter(Boolean);
}

export async function getTaskAwaitingReason() {
  const ids = await redis.smembers(`tasks:awaitingReason`);
  if (!ids || ids.length === 0) return null;
  const task = await redis.get(`task:${ids[0]}`);
  return task;
}

export async function updateTask(id, updates) {
  const task = await redis.get(`task:${id}`);
  if (!task) throw new Error("Task not found");
  const updated = { ...task, ...updates };
  await redis.set(`task:${id}`, updated);

  if (updates.status && updates.status !== STATUS.PENDING) {
    await redis.srem(`tasks:allActive`, id);
  }
  if (updates.awaitingReason === true) {
    await redis.sadd(`tasks:awaitingReason`, id);
  }
  if (updates.awaitingReason === false) {
    await redis.srem(`tasks:awaitingReason`, id);
  }

  return updated;
}
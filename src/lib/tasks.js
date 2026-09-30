import { redis } from "./redis";

export const CATEGORIES = ["Study", "Work", "Growth", "Health", "Personal"];
export const STATUS = {
  PENDING: "pending",
  DONE: "done",
  DIDNT: "didnt",
  COULDNT: "couldnt",
};

export async function createTask(task) {
  const id = `task_${Date.now()}`;
  const seq = await redis.incr("task:seq:counter");

  const fullTask = {
    id,
    seq,
    title: task.title,
    category: task.category,
    date: task.date,
    time: task.time,
    timerMinutes: task.timerMinutes,
    status: STATUS.PENDING,
    reason: null,
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
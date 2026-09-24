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
  const fullTask = {
    id,
    title: task.title,
    category: task.category,
    date: task.date,
    time: task.time,
    timerMinutes: task.timerMinutes,
    status: STATUS.PENDING,
    reason: null,
    timerStarted: false,
    completionAsked: false,
    createdAt: Date.now(),
  };

  await redis.set(`task:${id}`, fullTask);
  await redis.sadd(`tasks:byDate:${task.date}`, id);
  await redis.sadd(`tasks:allActive`, id);

  return fullTask;
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

export async function updateTask(id, updates) {
  const task = await redis.get(`task:${id}`);
  if (!task) throw new Error("Task not found");
  const updated = { ...task, ...updates };
  await redis.set(`task:${id}`, updated);

  if (updates.status && updates.status !== STATUS.PENDING) {
    await redis.srem(`tasks:allActive`, id);
  }

  return updated;
}
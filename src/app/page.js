"use client";

import { useState, useEffect } from "react";

const CATEGORIES = ["Study", "Work", "Growth", "Health", "Personal"];
const CATEGORY_COLORS = {
  Study: "#A78BFA",
  Work: "#60A5FA",
  Growth: "#FBBF24",
  Health: "#6EE7B7",
  Personal: "#F472B6",
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const [date, setDate] = useState(todayString());
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Personal");
  const [time, setTime] = useState("");
  const [timerMinutes, setTimerMinutes] = useState(5);

  async function loadTasks() {
    setLoading(true);
    const res = await fetch(`/api/tasks?date=${date}`);
    const data = await res.json();
    setTasks(data.sort((a, b) => a.time.localeCompare(b.time)));
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, [date]);

  async function addTask(e) {
    e.preventDefault();
    if (!title || !time) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, category, date, time, timerMinutes: Number(timerMinutes) }),
    });
    setTitle("");
    setTime("");
    loadTasks();
  }

  const statusLabel = {
    pending: "Pending",
    done: "Done",
    didnt: "Missed",
    couldnt: "Couldn't",
  };
  const statusColor = {
    pending: "var(--muted)",
    done: "var(--done)",
    didnt: "var(--missed)",
    couldnt: "var(--missed)",
  };

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>flowlock</h1>
      <p style={{ color: "var(--muted)", marginBottom: 32, fontSize: 14 }}>
        Dependencies decide what moves next.
      </p>

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 12px",
          color: "var(--text)",
          marginBottom: 24,
        }}
      />

      <form
        onSubmit={addTask}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "var(--surface)",
          padding: 16,
          borderRadius: 12,
          marginBottom: 32,
        }}
      >
        <input
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text)",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "var(--text)",
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{
              flex: 1,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "var(--text)",
            }}
          />
          <input
            type="number"
            min="1"
            value={timerMinutes}
            onChange={(e) => setTimerMinutes(e.target.value)}
            title="Timer minutes"
            style={{
              width: 70,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              color: "var(--text)",
            }}
          />
        </div>
        <button
          type="submit"
          style={{
            background: "var(--accent)",
            color: "#0F0F14",
            border: "none",
            borderRadius: 8,
            padding: "10px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Add task
        </button>
      </form>

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : tasks.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>Nothing scheduled for this day.</p>
      ) : (
        <div>
          {tasks.map((task) => (
            <div
              key={task.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: CATEGORY_COLORS[task.category] || "var(--muted)",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{task.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {task.time} · {task.timerMinutes} min
                  {task.reason ? ` · "${task.reason}"` : ""}
                </div>
              </div>
              <span style={{ fontSize: 12, color: statusColor[task.status], fontWeight: 600 }}>
                {statusLabel[task.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
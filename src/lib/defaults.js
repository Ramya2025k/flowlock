// Your daily default tasks. They are created automatically for every date.
// time is 24-hour IST. notifyMinutes = how many minutes before the time to send the heads-up.
export const DEFAULT_TASKS = [
  { key: "wake",    title: "Wake up",          time: "05:00", category: "Personal", notifyMinutes: 3 },
  { key: "sir",     title: "Improve with sir", time: "05:30", category: "Personal", notifyMinutes: 3 },
  { key: "leave",   title: "Leave home",       time: "09:00", category: "Personal", notifyMinutes: 3 },
  { key: "dishes",  title: "Washing dishes",   time: "21:00", category: "Personal", notifyMinutes: 3 },
  { key: "journal", title: "Journal writing",  time: "22:30", category: "Personal", notifyMinutes: 3 },
];
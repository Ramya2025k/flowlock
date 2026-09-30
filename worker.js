require("dotenv").config({ path: ".env.local" });

const CRON_URL = "http://localhost:3000/api/cron";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log("Countdown worker running. Keep this window open.");
  while (true) {
    try {
      const res = await fetch(CRON_URL, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (res.status === 401) {
        console.log("Unauthorized: CRON_SECRET in .env.local doesn't match the cron route.");
      } else {
        const data = await res.json();
        if (data.results && data.results.length) {
          console.log(new Date().toLocaleTimeString(), data.results.join(" | "));
        }
      }
    } catch (e) {
      console.log("Can't reach the app. Is npm run dev running?");
    }
    await sleep(2000);
  }
}

run();
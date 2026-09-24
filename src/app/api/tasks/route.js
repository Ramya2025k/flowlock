import { NextResponse } from "next/server";
import { createTask, getTasksByDate } from "@/lib/tasks";

export async function POST(request) {
  const body = await request.json();
  const task = await createTask(body);
  return NextResponse.json(task);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date query param required" }, { status: 400 });
  }
  const tasks = await getTasksByDate(date);
  return NextResponse.json(tasks);
}

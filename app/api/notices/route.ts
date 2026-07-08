import { NextResponse } from "next/server";
import { fetchNotices } from "@/lib/notices";

export async function GET() {
  const result = await fetchNotices();

  if (!result.ok) {
    return NextResponse.json({ ok: false, notices: [], error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, notices: result.notices });
}

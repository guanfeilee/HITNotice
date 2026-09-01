import { NextResponse } from "next/server";

function gone(request: Request) {
  void request;
  return NextResponse.json(
    { ok: false, error: "Resend webhook processing has been retired." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export const POST = gone;
export const GET = gone;

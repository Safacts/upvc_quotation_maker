import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.redirect("/app/index.html");
}

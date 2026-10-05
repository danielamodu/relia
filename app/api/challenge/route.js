import { NextResponse } from "next/server";
import { challengeCase, getChallengeCases } from "../../../src/application/relia-service.mjs";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await getChallengeCases()); }
  catch (error) { return NextResponse.json({ error: error.message || "Could not load pilot benchmark cases." }, { status: 500 }); }
}

export async function POST(request) {
  try {
    const { id } = await request.json();
    return NextResponse.json(await challengeCase(id));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Challenge case failed." }, { status: 400 });
  }
}

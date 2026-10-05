import { NextResponse } from "next/server";
import { investigateUpgrade } from "../../../src/application/relia-service.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const input = await request.json();
    if (!input?.currentStack || !Array.isArray(input.proposedChanges)) return NextResponse.json({ error: "Choose a current stack and a proposed change." }, { status: 400 });
    return NextResponse.json(await investigateUpgrade(input));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Investigation failed." }, { status: 500 });
  }
}

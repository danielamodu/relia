import { attackInvestigation } from "../../../../../../src/application/relia-service.mjs";

export const runtime = "nodejs";

export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    const result = await attackInvestigation(id);
    return result ? Response.json(result, { status: result.investigation.status === "FAILED" ? 503 : 200 }) : Response.json({ error: { code: "INVESTIGATION_NOT_FOUND", message: `Investigation ${id} was not found.` } }, { status: 404 });
  } catch (error) {
    return Response.json({ error: { code: "ATTACK_FAILED", message: error.message || "Red-team replay failed." } }, { status: 500 });
  }
}

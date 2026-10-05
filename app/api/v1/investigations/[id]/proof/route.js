import { getInvestigationProof } from "../../../../../../src/application/relia-service.mjs";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const proof = await getInvestigationProof(id);
    return proof ? Response.json(proof) : Response.json({ error: { code: "INVESTIGATION_NOT_FOUND", message: `Investigation ${id} was not found.` } }, { status: 404 });
  } catch (error) {
    return Response.json({ error: { code: "PROOF_READ_FAILED", message: error.message || "Could not read proof." } }, { status: 500 });
  }
}

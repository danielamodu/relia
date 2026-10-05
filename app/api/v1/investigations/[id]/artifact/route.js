import { getInvestigationArtifact, getInvestigation } from "../../../../../../src/application/relia-service.mjs";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const [artifact, record] = await Promise.all([getInvestigationArtifact(id), getInvestigation(id)]);
    if (!record) return Response.json({ error: { code: "INVESTIGATION_NOT_FOUND", message: `Investigation ${id} was not found.` } }, { status: 404 });
    if (!artifact) return Response.json({ error: { code: "ARTIFACT_UNAVAILABLE", message: "No verified artifact was issued because a required infrastructure stage failed." } }, { status: 409 });
    return Response.json(artifact);
  } catch (error) {
    return Response.json({ error: { code: "ARTIFACT_READ_FAILED", message: error.message || "Could not read decision artifact." } }, { status: 500 });
  }
}

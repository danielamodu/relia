import { ContractValidationError } from "../../../../src/application/change-contract.mjs";
import { createInvestigation } from "../../../../src/application/relia-service.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 }); }
  try {
    const result = await createInvestigation(body.contract ?? body);
    return Response.json(result, { status: result.investigation.status === "FAILED" ? 503 : 201 });
  } catch (error) {
    if (error instanceof ContractValidationError) return Response.json({ error: { code: "INVALID_CHANGE_CONTRACT", message: error.message, details: error.details } }, { status: 400 });
    return Response.json({ error: { code: "INVESTIGATION_FAILED", message: error.message || "Investigation failed." } }, { status: 500 });
  }
}

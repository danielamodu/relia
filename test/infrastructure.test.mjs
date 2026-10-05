import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SanitySnapshotRepository } from "../src/knowledge/SanitySnapshotRepository.mjs";
import { EvidenceGraph } from "../src/infrastructure/EvidenceGraph.mjs";
import { ContractValidationError, canonicalizeChangeContract, validateChangeContract } from "../src/application/change-contract.mjs";
import { createInvestigation, canonicalJson, isDecisionArtifactValid } from "../src/application/relia-service.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = await SanitySnapshotRepository.open();
const snapshot = { id: "test-snapshot", documentCount: repository.allDocuments().length };
const graph = new EvidenceGraph(repository, snapshot);
const next16Contract = {
  subject: { technology: "nextjs", from: "15", to: "16" },
  environment: { node: "20.8", react: "19", typescript: "5.1" },
  context: { router: "pages" },
  requestedBy: "infrastructure-test",
};

test("ChangeContract validates required fields and rejects malformed changes", async () => {
  const clean = await validateChangeContract(next16Contract);
  assert.equal(clean.subject.technology, "nextjs");
  await assert.rejects(() => validateChangeContract({ subject: { technology: "", from: "15" }, environment: [], context: {} }), ContractValidationError);
  await assert.rejects(() => validateChangeContract({ ...next16Contract, subject: { ...next16Contract.subject, to: "15" } }), ContractValidationError);
});

test("ChangeContract canonical serialization ignores object key order and trims labels", async () => {
  const left = { subject: { technology: " nextjs ", from: "15", to: "16" }, environment: { node: "20.8", react: "19" }, context: { router: "pages" } };
  const right = { context: { router: "pages" }, environment: { react: "19", node: "20.8" }, subject: { to: "16", from: "15", technology: "nextjs" } };
  assert.equal(canonicalizeChangeContract(await validateChangeContract(left)), canonicalizeChangeContract(await validateChangeContract(right)));
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
});

test("EvidenceGraph resolves technologies and follows typed requirements and compatibility edges", () => {
  assert.equal(graph.resolveTechnology("nextjs")._id, "tech-nextjs");
  const target = graph.resolveVersion("nextjs", "16");
  assert.equal(target._id, "version-next-16");
  assert.equal(graph.findRequirements(target._id).length, 2);
  assert.ok(graph.findCompatibilityRules(target._id).length > 0);
  assert.ok(graph.findRelatedEvidence(target._id).edges.length > 0);
  assert.ok(Array.isArray(graph.findContradictions(target._id)));
});

test("EvidenceGraph traverses exceptions, breaking changes, migrations, and provenance", () => {
  assert.ok(graph.findExceptions("version-next-15").some((item) => item._id === "exception-next15-pages-react18"));
  const changes = graph.findBreakingChanges("version-next-16");
  assert.ok(changes.some((item) => item._id === "breaking-next16-middleware-proxy"));
  assert.ok(graph.findMigrations("breaking-next16-middleware-proxy").some((item) => item._id === "migration-middleware-proxy"));
  const trace = graph.traceProvenance(["requirement-next16-node"]);
  assert.ok(trace.some((item) => item.sourceUrl.startsWith("https://")));
});

test("Investigation lifecycle collects evidence, decides, attacks, and issues validated provenance", async () => {
  const { investigation, artifact } = await createInvestigation(next16Contract);
  assert.equal(investigation.status, "COMPLETED");
  assert.equal(investigation.decision.initial, "BLOCKED");
  assert.equal(investigation.attack.executed, true);
  assert.equal(investigation.attack.status, "CHALLENGE_FOUND");
  assert.equal(investigation.decision.status, "BLOCKED");
  assert.equal(artifact.decision, "BLOCKED");
  assert.equal(await isDecisionArtifactValid(artifact), true);
  assert.equal(artifact.proof.complete, true);
  assert.ok(artifact.provenance.evidenceSnapshot.id.startsWith("sanity:gjy7dyq2.production:"));
  assert.ok(artifact.provenance.sources.every((source) => source.url.startsWith("https://")));
  assert.ok(artifact.relationships.some((edge) => edge.relationship === "requires"));
});

test("Red-team challenge can revise a provisional SAFE result and unknown evidence stays UNRESOLVED", async () => {
  const lifecycleCase = {
    subject: { technology: "Next.js", from: "14", to: "15" },
    environment: { node: "18.18", react: "18", typescript: "5.0" },
    context: { router: "Pages" },
    metadata: { scope: "full-upgrade" },
    requestedBy: "infrastructure-test",
  };
  const challenged = await createInvestigation(lifecycleCase);
  assert.equal(challenged.investigation.decision.initial, "SAFE");
  assert.equal(challenged.investigation.attack.status, "CHALLENGE_FOUND");
  assert.equal(challenged.investigation.attack.finalDecision, "UNRESOLVED");
  assert.ok(challenged.investigation.attack.challenges.some((item) => item.evidenceId === "breaking-next15-async-request"));
  assert.equal(challenged.investigation.decision.status, "UNRESOLVED");

  const missing = await createInvestigation({ subject: { technology: "vite-plugin-react", from: "1", to: "2" }, environment: {}, context: {}, requestedBy: "infrastructure-test" });
  assert.equal(missing.investigation.decision.status, "UNRESOLVED");
  assert.equal(missing.artifact.proof.complete, false);
});

test("A failed mandatory red-team stage issues no verified artifact", async () => {
  const failed = await createInvestigation(next16Contract, { investigator: () => { throw new Error("Red-team stage unavailable."); } });
  assert.equal(failed.investigation.status, "FAILED");
  assert.equal(failed.investigation.decision.status, "UNRESOLVED");
  assert.equal(failed.investigation.attack.status, "FAILED");
  assert.equal(failed.investigation.attack.executed, false);
  assert.equal(failed.artifact, null);
});

test("Versioned HTTP API creates, reads, attacks, and returns proof and artifact", async () => {
  const collection = await import("../app/api/v1/investigations/route.js");
  const getRoute = await import("../app/api/v1/investigations/[id]/route.js");
  const attackRoute = await import("../app/api/v1/investigations/[id]/attack/route.js");
  const proofRoute = await import("../app/api/v1/investigations/[id]/proof/route.js");
  const artifactRoute = await import("../app/api/v1/investigations/[id]/artifact/route.js");
  const request = new Request("http://localhost/api/v1/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next16Contract) });
  const createdResponse = await collection.POST(request);
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const id = created.investigation.id;
  const params = { params: Promise.resolve({ id }) };
  assert.equal((await (await getRoute.GET(new Request(`http://localhost/api/v1/investigations/${id}`), params)).json()).investigation.id, id);
  assert.ok((await (await proofRoute.GET(new Request(`http://localhost/api/v1/investigations/${id}/proof`), params)).json()).proof.trace.length > 0);
  assert.equal((await (await artifactRoute.GET(new Request(`http://localhost/api/v1/investigations/${id}/artifact`), params)).json()).investigationId, id);
  assert.equal((await attackRoute.POST(new Request(`http://localhost/api/v1/investigations/${id}/attack`, { method: "POST" }), params)).status, 200);
  assert.equal((await getRoute.GET(new Request("http://localhost/api/v1/investigations/inv_missing"), { params: Promise.resolve({ id: "inv_missing" }) })).status, 404);
  const malformed = await collection.POST(new Request("http://localhost/api/v1/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject: { technology: "Next.js" } }) }));
  assert.equal(malformed.status, 400);
});

test("CLI text and JSON output reuse the investigation application service", async () => {
  const args = ["src/cli.mjs", "investigate", "--technology", "nextjs", "--from", "15", "--to", "16", "--node", "20.8", "--react", "19", "--typescript", "5.1", "--router", "pages", "--requested-by", "cli-api-parity"];
  const textRun = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(textRun.status, 0, textRun.stderr);
  assert.match(textRun.stdout, /Decision: BLOCKED/);
  assert.match(textRun.stdout, /Verification: CHALLENGE_FOUND \(executed\)/);
  const jsonRun = spawnSync(process.execPath, [...args, "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(jsonRun.status, 0, jsonRun.stderr);
  const artifact = JSON.parse(jsonRun.stdout);
  assert.equal(artifact.decision, "BLOCKED");
  assert.equal(await isDecisionArtifactValid(artifact), true);
  const api = await createInvestigation({ ...next16Contract, requestedBy: "cli-api-parity" });
  assert.equal(artifact.fingerprint, api.artifact.fingerprint);
  assert.equal(artifact.decision, api.artifact.decision);
});

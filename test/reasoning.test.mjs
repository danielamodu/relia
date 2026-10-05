import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SanitySnapshotRepository } from "../src/knowledge/SanitySnapshotRepository.mjs";
import { investigate, meetsRange, validateProofTrace } from "../src/reasoning/engine.mjs";

const repository = await SanitySnapshotRepository.open();
const cases = (await readFile(new URL("../benchmark/cases.jsonl", import.meta.url), "utf8"))
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);
const drafts = JSON.parse(await readFile(new URL("../benchmark/draft-review.json", import.meta.url), "utf8"));

test("every executable case traces to an existing draft prompt", () => {
  const draftIds = new Set(drafts.map((draft) => draft.id));
  assert.equal(cases.length, 12);
  for (const item of cases) assert.ok(draftIds.has(item.reviewedDraftId), `${item.id} references missing draft ${item.reviewedDraftId}`);
});

test("the offline snapshot contains the verified typed Sanity corpus", () => {
  assert.equal(repository.getSnapshotMetadata().documents, 52);
  assert.equal(repository.getTechnology("Node.js")._id, "tech-node");
  assert.equal(repository.getRequirements({ subject: "version-next-16" }).length, 2);
  assert.equal(repository.queryRelationships({ from: "version-next-16", relationship: "requires" }).length, 2);
});

test("version range comparison handles the documented numeric floor", () => {
  assert.equal(meetsRange("20.8", ">=20.9.0"), false);
  assert.equal(meetsRange("20.9", ">=20.9.0"), true);
  assert.equal(meetsRange("5.0", ">=5.1.0"), false);
  assert.equal(meetsRange("current", ">=20.9.0"), null);
});

for (const item of cases) {
  test(`reasoning case ${item.id} produces its adjudicated decision and red-team result`, () => {
    const result = investigate(repository, item.input);
    assert.equal(result.decision, item.expectedDecision);
    assert.equal(result.redTeam.status, item.expectedRedTeam);
    const evidenceIds = new Set(result.evidence.map((record) => record.id));
    for (const id of item.expectedEvidence) assert.ok(evidenceIds.has(id), `${item.id} is missing expected evidence ${id}`);
    assert.equal(validateProofTrace(result), true);
    for (const finding of result.findings) {
      assert.ok(finding.proofTrace.length > 0, `${item.id} finding has no inspectable proof trace`);
      assert.ok(finding.proofTrace.every((proof) => proof.sourceId && proof.sourceUrl && proof.documentId === finding.evidenceIds[0]));
    }
    for (const source of result.sources) assert.match(source.url, /^https:\/\//);
  });
}

test("unknown relationships remain UNRESOLVED without fabricated evidence", () => {
  const item = cases.find((candidate) => candidate.id === "c12-unknown-vite-relationship");
  const result = investigate(repository, item.input);
  assert.equal(result.decision, "UNRESOLVED");
  assert.equal(result.evidence.length, 0);
  assert.equal(result.sources.length, 0);
});

test("missing router context does not incorrectly override the Next.js 15 Pages exception", () => {
  const item = cases.find((candidate) => candidate.id === "c09-next15-react18-router-unknown");
  const result = investigate(repository, item.input);
  assert.equal(result.decision, "UNRESOLVED");
  assert.ok(result.unresolved.some((message) => message.includes("Router is unspecified")));
});

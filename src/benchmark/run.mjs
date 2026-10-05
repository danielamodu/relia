import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SanitySnapshotRepository } from "../knowledge/SanitySnapshotRepository.mjs";
import { KeywordRetriever } from "../baseline/KeywordRetriever.mjs";
import { FlatRetriever } from "../baseline/FlatRetriever.mjs";
import { validateProofTrace } from "../reasoning/engine.mjs";
import { decideFromFlatText, keywordQuery } from "./baselines.mjs";
import { LocalReliaAdapter, scoreDecision, scoreEvidence, classificationMetrics } from "./adapters.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const benchmarkRoot = path.join(projectRoot, "benchmark");
const reportRoot = path.join(projectRoot, "reports");
const lines = (await readFile(path.join(benchmarkRoot, "cases.jsonl"), "utf8")).split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
const cases = lines.map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`cases.jsonl:${index + 1}: ${error.message}`); }
});
if (cases.length < 10 || cases.length > 12) throw new Error(`Expected 10–12 reviewed cases; found ${cases.length}.`);
const uniqueIds = new Set(cases.map((item) => item.id));
if (uniqueIds.size !== cases.length) throw new Error("Benchmark contains duplicate case IDs.");
for (const item of cases) {
  if (!item.input?.currentStack || !Array.isArray(item.input.proposedChanges) || !["SAFE", "BLOCKED", "UNRESOLVED"].includes(item.expectedDecision)) throw new Error(`Invalid executable case: ${item.id}`);
  if (!["ANSWERABLE", "INSUFFICIENT_EVIDENCE"].includes(item.reviewStatus)) throw new Error(`Case ${item.id} is not adjudicated for execution.`);
  if (item.reviewStatus === "INSUFFICIENT_EVIDENCE" && item.expectedDecision !== "UNRESOLVED") throw new Error(`Insufficient-evidence case ${item.id} must expect UNRESOLVED.`);
}

const [repository, caseSchema, snapshotMetadata] = await Promise.all([
  SanitySnapshotRepository.open(),
  readFile(path.join(benchmarkRoot, "case.schema.json"), "utf8").then(JSON.parse),
  readFile(path.join(projectRoot, "data", "sanity-evidence-snapshot.meta.json"), "utf8").then(JSON.parse),
]);
const factIds = new Set(repository.allDocuments().map((document) => document._id));
const sourceIds = new Set(repository.getSources().map((source) => source._id));
for (const item of cases) {
  for (const id of item.expectedEvidence) if (!factIds.has(id)) throw new Error(`Case ${item.id} expects missing Sanity document ${id}.`);
  for (const id of item.requiredSources) if (!sourceIds.has(id)) throw new Error(`Case ${item.id} references missing source ${id}.`);
}

const keyword = new KeywordRetriever(repository);
const flat = new FlatRetriever(repository);
const relia = new LocalReliaAdapter();
const topK = 10;
const results = [];
for (const item of cases) {
  const query = keywordQuery(item);
  const keywordDocs = keyword.retrieve(query, { limit: topK });
  const flatDocs = flat.retrieve(query, { limit: topK });
  const keywordDecision = decideFromFlatText(repository, item, keywordDocs);
  const flatDecision = decideFromFlatText(repository, item, flatDocs);
  const reliaDecision = await relia.run(repository, item.input);
  const expectedIds = item.expectedEvidence;
  const systemResults = {
    keyword: { ...keywordDecision, retrieval: keywordDocs.map(({ id, type, score, matched_terms, text }) => ({ id, type, score, matchedTerms: matched_terms, excerpt: text.slice(0, 320) })) },
    flat: { ...flatDecision, retrieval: flatDocs.map(({ id, type, score, matched_terms, text }) => ({ id, type, score, matchedTerms: matched_terms, excerpt: text.slice(0, 320) })) },
    relia: reliaDecision,
  };
  for (const [name, result] of Object.entries(systemResults)) {
    result.score = scoreDecision(item.expectedDecision, result.decision);
    result.evidenceScore = scoreEvidence(expectedIds, result.evidence.map((record) => typeof record === "string" ? record : record.id));
  }
  const proofDocIds = new Set(reliaDecision.proofTrace.map((proof) => proof.documentId));
  const expectedProofIdsComplete = expectedIds.every((id) => proofDocIds.has(id));
  const provenanceComplete = reliaDecision.proofTrace.every((proof) => {
    const source = repository.getSources().find((candidate) => candidate._id === proof.sourceId);
    return Boolean(source && proof.sourceUrl === source.url);
  });
  results.push({
    id: item.id,
    category: item.category,
    question: item.question,
    input: item.input,
    reviewStatus: item.reviewStatus,
    expected: { decision: item.expectedDecision, evidence: expectedIds, relationships: item.requiredRelationships, sources: item.requiredSources, rationale: item.expectedRationale, expectedRedTeam: item.expectedRedTeam },
    systems: systemResults,
    quality: {
      reliaExpectedEvidenceCovered: expectedProofIdsComplete,
      reliaProofTraceFieldsComplete: validateProofTrace(reliaDecision),
      reliaSourceProvenanceValid: provenanceComplete,
      redTeamDetectedExpectedChallenge: (reliaDecision.redTeam.status === "CHALLENGE_FOUND") === (item.expectedRedTeam === "CHALLENGE_FOUND"),
    },
    unresolved: reliaDecision.unresolved,
    provenance: item.requiredSources.map((id) => {
      const source = repository.getSources().find((record) => record._id === id);
      return { id, title: source?.title ?? null, url: source?.url ?? null };
    }),
  });
}

const scoreSystem = (name) => {
  const decisions = results.map((row) => ({ expected: row.expected.decision, actual: row.systems[name].decision, correct: row.systems[name].decision === row.expected.decision }));
  const evidenceCoverageRows = results.map((row) => row.systems[name].evidenceScore.recall).filter((value) => value !== null);
  const macroEvidenceCoverage = evidenceCoverageRows.length ? evidenceCoverageRows.reduce((sum, value) => sum + value, 0) / evidenceCoverageRows.length : null;
  const mean = (predicate) => {
    const rows = results.filter(predicate);
    return rows.length ? rows.filter((row) => row.systems[name].decision === row.expected.decision).length / rows.length : null;
  };
  const evidencePrecisionRows = results.map((row) => row.systems[name].evidenceScore.precision).filter((value) => value !== null);
  return {
    ...classificationMetrics(decisions),
    safePrecision: mean((row) => row.systems[name].decision === "SAFE"),
    blockedPrecision: mean((row) => row.systems[name].decision === "BLOCKED"),
    unresolvedPrecision: mean((row) => row.systems[name].decision === "UNRESOLVED"),
    evidenceCoverage: macroEvidenceCoverage,
    evidencePrecision: evidencePrecisionRows.length ? evidencePrecisionRows.reduce((sum, value) => sum + value, 0) / evidencePrecisionRows.length : null,
    unresolvedCases: results.filter((row) => row.systems[name].decision === "UNRESOLVED").map((row) => row.id),
    failures: results.filter((row) => !row.systems[name].score.correct).map((row) => ({ caseId: row.id, expected: row.expected.decision, actual: row.systems[name].decision })),
  };
};
const reliaMetrics = scoreSystem("relia");
const keywordMetrics = scoreSystem("keyword");
const flatMetrics = scoreSystem("flat");
const redTeamRows = results.map((row) => ({ expected: row.expected.expectedRedTeam, actual: row.systems.relia.redTeam.status, correct: (row.systems.relia.redTeam.status === "CHALLENGE_FOUND") === (row.expected.expectedRedTeam === "CHALLENGE_FOUND") }));
const traceCompleteness = results.length ? results.filter((row) => row.quality.reliaExpectedEvidenceCovered && row.quality.reliaProofTraceFieldsComplete && row.quality.reliaSourceProvenanceValid).length / results.length : null;
const redTeamDetection = {
  accuracy: redTeamRows.filter((row) => row.correct).length / redTeamRows.length,
  truePositive: redTeamRows.filter((row) => row.expected === "CHALLENGE_FOUND" && row.actual === "CHALLENGE_FOUND").length,
  falsePositive: redTeamRows.filter((row) => row.expected === "PASSED" && row.actual === "CHALLENGE_FOUND").length,
  falseNegative: redTeamRows.filter((row) => row.expected === "CHALLENGE_FOUND" && row.actual === "PASSED").length,
  failures: results.filter((row) => !row.quality.redTeamDetectedExpectedChallenge).map((row) => ({ caseId: row.id, expected: row.expected.expectedRedTeam, actual: row.systems.relia.redTeam.status })),
};

const report = {
  reportType: "relia-phase-3-benchmark",
  generatedAt: new Date().toISOString(),
  benchmarkVersion: 1,
  execution: { command: "npm run benchmark", offline: true, retrievalTopK: topK, caseSchema: caseSchema.$id },
  evidenceSnapshot: { ...snapshotMetadata, actualSnapshotDocuments: repository.allDocuments().length, sourceDocumentCount: repository.getSources().length },
  caseCount: cases.length,
  reviewedCaseCount: cases.filter((item) => item.reviewStatus === "ANSWERABLE").length,
  insufficientEvidenceCaseCount: cases.filter((item) => item.reviewStatus === "INSUFFICIENT_EVIDENCE").length,
  systems: {
    keyword: { description: "Keyword overlap over retrieved fact/source excerpts; no relationship traversal.", metrics: keywordMetrics },
    flat: { description: "Top-K flat Sanity document text retrieval; reference IDs remain opaque and are not joined.", metrics: flatMetrics },
    relia: { description: "Sanity snapshot relationship traversal, version checks, provenance, and independent red-team pass.", metrics: reliaMetrics, proofTraceCompleteness: traceCompleteness, redTeamChallengeDetection: redTeamDetection },
  },
  caseResults: results,
  sourceProvenance: repository.getSources().map(({ _id, title, url, publisher, accessedAt, publishedAt }) => ({ id: _id, title, url, publisher, accessedAt, publishedAt })),
};

const ablation = {
  reportType: "relia-phase-3-relationship-ablation",
  generatedAt: report.generatedAt,
  evidenceSnapshot: report.evidenceSnapshot,
  method: "FULL uses typed document references, version scope, joins, and the red-team pass. ABLATED uses the same Sanity document text and top-10 flat retrieval, leaves references as opaque IDs, and applies a conservative decision rule without joins.",
  fullSystem: { accuracy: reliaMetrics.accuracy, correct: reliaMetrics.correct, caseCount: cases.length },
  ablatedSystem: { accuracy: flatMetrics.accuracy, correct: flatMetrics.correct, caseCount: cases.length },
  accuracyDifference: reliaMetrics.accuracy - flatMetrics.accuracy,
  relationshipAwareWins: results.filter((row) => row.systems.relia.score.correct && !row.systems.flat.score.correct).map((row) => row.id),
  flatWins: results.filter((row) => !row.systems.relia.score.correct && row.systems.flat.score.correct).map((row) => row.id),
  sameOutcomeDifferentDecision: results.filter((row) => row.systems.relia.decision !== row.systems.flat.decision).map((row) => ({ caseId: row.id, expected: row.expected.decision, full: row.systems.relia.decision, ablated: row.systems.flat.decision })),
  caseResults: results.map((row) => ({ id: row.id, expected: row.expected.decision, full: row.systems.relia.decision, ablated: row.systems.flat.decision, expectedEvidence: row.expected.evidence, fullEvidence: row.systems.relia.evidence.map((record) => record.id), ablatedEvidence: row.systems.flat.evidence })),
};

await writeFile(path.join(reportRoot, "relia-benchmark.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(path.join(reportRoot, "relia-ablation.json"), `${JSON.stringify(ablation, null, 2)}\n`, "utf8");

const fmt = (value) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const markdown = [
  "# Relia benchmark results",
  "",
  `Generated: ${report.generatedAt}`,
  `Sanity evidence snapshot: ${snapshotMetadata.projectId}.${snapshotMetadata.dataset}; retrieved ${snapshotMetadata.retrievedAt}; ${repository.allDocuments().length} documents. Benchmark execution was offline.`,
  "",
  `Cases: ${cases.length} (${report.reviewedCaseCount} answerable, ${report.insufficientEvidenceCaseCount} insufficient-evidence). Retrieval top K: ${topK}.`,
  "",
  "## System metrics",
  "",
  "| System | Accuracy | SAFE precision | BLOCKED precision | UNRESOLVED precision | Evidence coverage |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...[["Keyword", keywordMetrics], ["Flat retrieval", flatMetrics], ["Relia", reliaMetrics]].map(([name, metrics]) => `| ${name} | ${fmt(metrics.accuracy)} (${metrics.correct}/${metrics.caseCount}) | ${fmt(metrics.safePrecision)} | ${fmt(metrics.blockedPrecision)} | ${fmt(metrics.unresolvedPrecision)} | ${fmt(metrics.evidenceCoverage)} |`),
  "",
  `Relia proof-trace completeness: ${fmt(traceCompleteness)}. Red-team challenge detection accuracy: ${fmt(redTeamDetection.accuracy)} (${redTeamDetection.truePositive} detected, ${redTeamDetection.falseNegative} missed, ${redTeamDetection.falsePositive} unexpected challenges).`,
  `Relationship ablation: FULL ${fmt(reliaMetrics.accuracy)}; ABLATED ${fmt(flatMetrics.accuracy)}; difference ${(ablation.accuracyDifference * 100).toFixed(1)} percentage points. Relationship-aware wins: ${ablation.relationshipAwareWins.length}; flat wins: ${ablation.flatWins.length}.`,
  "",
  "## Case results",
  "",
  "| Case | Expected | Keyword | Flat | Relia | Red team |",
  "| --- | --- | --- | --- | --- | --- |",
  ...results.map((row) => `| ${row.id} | ${row.expected.decision} | ${row.systems.keyword.decision}${row.systems.keyword.score.correct ? " ✓" : " ✗"} | ${row.systems.flat.decision}${row.systems.flat.score.correct ? " ✓" : " ✗"} | ${row.systems.relia.decision}${row.systems.relia.score.correct ? " ✓" : " ✗"} | ${row.systems.relia.redTeam.status}${row.quality.redTeamDetectedExpectedChallenge ? " ✓" : " ✗"} |`),
  "",
  "## Failures",
  "",
  ...[["Keyword", keywordMetrics], ["Flat retrieval", flatMetrics], ["Relia", reliaMetrics]].map(([name, metrics]) => `- ${name}: ${metrics.failures.length ? metrics.failures.map((failure) => `${failure.caseId} expected ${failure.expected}, got ${failure.actual}`).join("; ") : "none"}`),
  `- Red team: ${redTeamDetection.failures.length ? redTeamDetection.failures.map((failure) => `${failure.caseId} expected ${failure.expected}, got ${failure.actual}`).join("; ") : "none"}`,
  "",
  "## Relia unresolved cases",
  "",
  ...(reliaMetrics.unresolvedCases.length ? reliaMetrics.unresolvedCases.map((id) => `- ${id}: ${results.find((row) => row.id === id).unresolved.join(" ")}`) : ["- None"]),
  "",
  "## Limits",
  "",
  "Keyword and flat systems are deterministic retrieval baselines, not model-based RAG. Flat retrieval leaves Sanity references opaque. Results measure this reviewed 12-case corpus and retrieved snapshot only; they do not establish broad ecosystem coverage or general performance beyond these cases.",
  "",
  "Full per-case records, retrieved evidence, proof traces, sources, and red-team challenges are in `relia-benchmark.json`. Ablation records are in `relia-ablation.json`.",
  "",
].join("\n");
await writeFile(path.join(reportRoot, "relia-benchmark.md"), markdown, "utf8");
console.log(`Case count: ${cases.length} (answerable: ${report.reviewedCaseCount}, insufficient evidence: ${report.insufficientEvidenceCaseCount})`);
console.log(`Snapshot: Sanity ${snapshotMetadata.projectId}.${snapshotMetadata.dataset}, ${repository.allDocuments().length} documents; offline run`);
for (const [name, metrics] of [["Keyword", keywordMetrics], ["Flat", flatMetrics], ["Relia", reliaMetrics]]) console.log(`${name}: ${metrics.correct}/${cases.length} correct (${fmt(metrics.accuracy)}); evidence coverage ${fmt(metrics.evidenceCoverage)}; SAFE precision ${fmt(metrics.safePrecision)}; BLOCKED precision ${fmt(metrics.blockedPrecision)}; UNRESOLVED precision ${fmt(metrics.unresolvedPrecision)}`);
console.log(`Relia proof-trace completeness: ${fmt(traceCompleteness)}; red-team challenge detection accuracy: ${fmt(redTeamDetection.accuracy)}`);
console.log(`Ablation accuracy difference (FULL - ABLATED): ${(ablation.accuracyDifference * 100).toFixed(1)} percentage points; relationship-aware wins: ${ablation.relationshipAwareWins.length}`);
for (const row of results) console.log(`${row.id}: expected ${row.expected.decision}; Keyword ${row.systems.keyword.decision}; Flat ${row.systems.flat.decision}; Relia ${row.systems.relia.decision}; red-team ${row.systems.relia.redTeam.status}`);
console.log("Reports written: reports/relia-benchmark.json, reports/relia-benchmark.md, reports/relia-ablation.json");

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import { SanitySnapshotRepository } from "../knowledge/SanitySnapshotRepository.mjs";
import { loadLiveSanityContextRepository } from "../sanity-context/live-repository.mjs";
import { EvidenceGraph } from "../infrastructure/EvidenceGraph.mjs";
import { investigate, validateProofTrace } from "../reasoning/engine.mjs";
import { canonicalizeChangeContract, toReasoningInput, validateChangeContract } from "./change-contract.mjs";

const root = process.cwd();
const storeDirectory = path.join(root, ".relia", "investigations");
let runtimePromise;
let artifactValidatorPromise;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function getRuntime(contract) {
  const source = process.env.RELIA_KNOWLEDGE_SOURCE ?? (process.env.NODE_ENV === "production" ? "context-mcp" : "snapshot");
  if (source === "context-mcp") {
    const { repository, snapshot } = await loadLiveSanityContextRepository(contract);
    return { repository, graph: new EvidenceGraph(repository, snapshot), snapshot };
  }
  if (process.env.NODE_ENV === "production") throw new Error("Production investigations must use the live Sanity Context MCP source.");
  if (source !== "snapshot") throw new Error("RELIA_KNOWLEDGE_SOURCE must be either context-mcp or snapshot.");
  runtimePromise ??= (async () => {
    const [repository, metadata, snapshotBytes] = await Promise.all([
      SanitySnapshotRepository.open(),
      readFile(path.join(root, "data", "sanity-evidence-snapshot.meta.json"), "utf8").then(JSON.parse),
      readFile(path.join(root, "data", "sanity-evidence-snapshot.json")),
    ]);
    const snapshotHash = sha256(snapshotBytes);
    const snapshot = {
      id: `sanity:${metadata.projectId}.${metadata.dataset}:sha256:${snapshotHash}`,
      projectId: metadata.projectId,
      dataset: metadata.dataset,
      retrievedAt: metadata.retrievedAt,
      documentCount: repository.allDocuments().length,
      contentSha256: snapshotHash,
      retrieval: metadata.retrieval,
    };
    return { repository, graph: new EvidenceGraph(repository, snapshot), snapshot };
  })();
  return runtimePromise;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

export function canonicalJson(value) { return JSON.stringify(stableValue(value)); }

function enrichProof(result, graph) {
  const documents = new Map(graph.allDocuments().map((record) => [record._id, record]));
  const sources = new Map(graph.getSources().map((source) => [source._id, source]));
  const seen = new Set();
  return result.proofTrace.flatMap((step) => {
    const key = `${step.documentId}|${step.field}|${step.sourceId}|${step.relationship}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const record = documents.get(step.documentId);
    const source = sources.get(step.sourceId);
    if (!record || !source) return [];
    const raw = record[step.field.split("/")[0]];
    const requirementTarget = record._type === "requirement" ? graph.getTechnology(record.requiredTechnology) : null;
    const requirementVersion = record._type === "requirement" ? graph.getVersion(record.subject) : null;
    const title = record.title ?? record.name ?? record.label ?? (record._type === "requirement"
      ? `${requirementVersion?.label ?? "Target version"} requirement · ${requirementTarget?.name ?? "dependency"}`
      : record.statement ?? record.effect ?? record.condition ?? record._id);
    const fact = record._type === "requirement"
      ? `${requirementTarget?.name ?? record.requiredTechnology} ${record.versionRange}`
      : Array.isArray(raw) ? raw.join("; ") : typeof raw === "string" ? raw : raw === undefined ? record.statement ?? record.effect ?? record.condition ?? record.outcome ?? record.versionRange ?? record.label ?? "" : JSON.stringify(raw);
    return [{ ...step, title, fact: String(fact).slice(0, 420), sourceTitle: source.title, sourcePublisher: source.publisher, sourceUrl: source.url }];
  });
}

function toFailure(error, contract, canonicalContract, startedAt) {
  const fingerprint = `sha256:${sha256(`${canonicalContract}\nunknown-evidence-snapshot`)}`;
  const id = `inv_${fingerprint.slice(7, 31)}`;
  const completedAt = new Date().toISOString();
  return {
    investigation: {
      id, fingerprint, contract, canonicalContract, status: "FAILED", startedAt, completedAt,
      evidenceSnapshot: null,
      decision: { status: "UNRESOLVED", initial: "UNRESOLVED", summary: "Evidence retrieval or the mandatory red-team stage failed; no verified decision artifact was issued.", confidence: "LOW", findings: [], unresolved: [error?.message ?? "Infrastructure failure."], blockingFactors: [] },
      attack: { status: "FAILED", executed: false, challenges: [], initialDecision: null, finalDecision: "UNRESOLVED", error: error?.message ?? "Infrastructure failure." },
      proof: { complete: false, trace: [] },
      artifact: null,
    },
    artifact: null,
  };
}

async function validateDecisionArtifact(artifact) {
  const schema = await readFile(path.join(root, "schemas", "verified-decision-artifact.schema.json"), "utf8").then(JSON.parse);
  artifactValidatorPromise ??= Promise.resolve(new Ajv({ allErrors: true, strict: false }).compile(schema));
  const validate = await artifactValidatorPromise;
  if (!validate(artifact)) throw new Error(`VerifiedDecisionArtifact schema validation failed: ${(validate.errors ?? []).map((item) => `${item.instancePath} ${item.message}`).join("; ")}`);
  const redTeam = artifact.verification?.redTeam;
  if (!redTeam?.executed || redTeam.status === "FAILED") throw new Error("A verified artifact requires a completed red-team result.");
  return true;
}

async function persist(investigation) {
  // Vercel route functions cannot share durable writes to the deployment bundle.
  // The API response is the portable record; interactive clients replay with its contract.
  if (process.env.VERCEL) return;
  await mkdir(storeDirectory, { recursive: true });
  const destination = path.join(storeDirectory, `${investigation.id}.json`);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${canonicalJson({ investigation, artifact: investigation.artifact })}\n`, "utf8");
  await rename(temporary, destination);
}

export async function createInvestigation(rawContract, options = {}) {
  const contract = await validateChangeContract(rawContract);
  const canonicalContract = canonicalizeChangeContract(contract);
  const startedAt = new Date().toISOString();
  let runtime;
  try {
    runtime = await getRuntime(contract);
    const fingerprint = `sha256:${sha256(`${canonicalContract}\n${runtime.snapshot.id}`)}`;
    const id = `inv_${fingerprint.slice(7, 31)}`;
    const input = toReasoningInput(contract, runtime.graph);
    const subjectTechnology = runtime.graph.resolveTechnology(contract.subject.technology);
    const currentVersion = subjectTechnology && runtime.graph.resolveVersion(subjectTechnology._id, contract.subject.from);
    const targetVersion = subjectTechnology && runtime.graph.resolveVersion(subjectTechnology._id, contract.subject.to);
    const executeInvestigation = options.investigator ?? investigate;
    const engineResult = await executeInvestigation(runtime.graph, input);
    if (!engineResult.redTeam || !["PASSED", "CHALLENGE_FOUND"].includes(engineResult.redTeam.status)) throw new Error("Mandatory red-team verification did not complete.");

    const unresolved = [...engineResult.unresolved];
    if (!currentVersion) unresolved.push(`Current version ${contract.subject.from} for ${subjectTechnology?.name ?? contract.subject.technology} is not resolved in the retrieved evidence.`);
    let finalDecision = engineResult.decision;
    if (!currentVersion && finalDecision === "SAFE") finalDecision = "UNRESOLVED";
    const currentVersionProof = currentVersion ? runtime.graph.traceProvenance([currentVersion._id]).map((record) => ({
      documentId: currentVersion._id,
      documentType: currentVersion._type,
      field: "label",
      relationship: "subject.from -> current technology version; version -> source",
      sourceId: record.sourceId,
      sourceUrl: record.sourceUrl,
      sourceTitle: record.sourceTitle,
    })) : [];
    const proofTrace = enrichProof({ ...engineResult, proofTrace: [...engineResult.proofTrace, ...currentVersionProof] }, runtime.graph);
    const proofComplete = proofTrace.length > 0 && validateProofTrace({ proofTrace });
    const findings = engineResult.findings;
    const evidence = [...engineResult.evidence];
    if (currentVersion && !evidence.some((item) => item.id === currentVersion._id)) evidence.push({ id: currentVersion._id, type: currentVersion._type, summary: `${subjectTechnology.name} ${currentVersion.label} is the declared current version.`, sourceIds: currentVersion.sources ?? [] });
    const documentIds = [...new Set(evidence.map((item) => item.id))];
    const documentSet = new Set(documentIds);
    const relationships = runtime.graph.queryRelationships().filter((edge) => documentSet.has(edge.recordId));
    const sourceMap = new Map(engineResult.sources.map((source) => [source.id, source]));
    for (const proof of proofTrace) {
      const source = runtime.graph.getSources().find((item) => item._id === proof.sourceId);
      if (source) sourceMap.set(source._id, { id: source._id, title: source.title, url: source.url });
    }
    const sources = [...sourceMap.values()];
    const completedAt = new Date().toISOString();
    const attack = {
      status: engineResult.redTeam.status,
      executed: true,
      challenges: engineResult.redTeam.challenges,
      initialDecision: engineResult.initialDecision,
      finalDecision,
    };
    const artifact = {
      artifactVersion: "1",
      investigationId: id,
      fingerprint,
      decision: finalDecision,
      subject: { technology: subjectTechnology?.name ?? contract.subject.technology, from: contract.subject.from, to: contract.subject.to },
      findings,
      constraints: evidence.filter((item) => item.type === "requirement"),
      evidence,
      relationships,
      proof: { complete: proofComplete, trace: proofTrace },
      verification: { redTeam: attack },
      provenance: {
        evidenceSnapshot: runtime.snapshot,
        sources,
        documents: documentIds.map((documentId) => ({ id: documentId, type: runtime.graph.document(documentId)?._type ?? null })),
        relationships,
        canonicalContract,
        timestamp: completedAt,
      },
    };
    await validateDecisionArtifact(artifact);
    const investigation = {
      id, fingerprint, contract, canonicalContract, status: "COMPLETED", startedAt, completedAt,
      evidenceSnapshot: runtime.snapshot,
      findings,
      decision: { status: finalDecision, initial: engineResult.initialDecision, summary: finalDecision === engineResult.decision ? engineResult.summary : "The current version is not resolvable, so a safe compatibility conclusion cannot be issued.", confidence: finalDecision === "UNRESOLVED" ? "LOW" : engineResult.confidence, findings, unresolved, blockingFactors: engineResult.blockingFactors },
      attack,
      proof: artifact.proof,
      provenance: artifact.provenance,
      artifact,
    };
    await persist(investigation);
    return { investigation, artifact };
  } catch (error) {
    const failure = toFailure(error, contract, canonicalContract, startedAt);
    try { await persist(failure.investigation); } catch { /* Preserve the explicit failure result if local storage is unavailable. */ }
    return failure;
  }
}

export async function getInvestigation(id) {
  if (!/^inv_[a-f0-9]{24}$/.test(String(id))) return null;
  try { return JSON.parse(await readFile(path.join(storeDirectory, `${id}.json`), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function attackInvestigation(id, contract) {
  if (!/^inv_[a-f0-9]{24}$/.test(String(id))) return null;
  if (contract) return { ...(await createInvestigation(contract)), replayedFrom: id };
  const existing = await getInvestigation(id);
  if (!existing) return null;
  const replay = await createInvestigation(existing.investigation.contract);
  return { ...replay, replayedFrom: id };
}

export async function getInvestigationProof(id) {
  const record = await getInvestigation(id);
  return record ? { investigationId: id, fingerprint: record.investigation.fingerprint, proof: record.investigation.proof, provenance: record.investigation.provenance } : null;
}

export async function getInvestigationArtifact(id) {
  const record = await getInvestigation(id);
  return record?.artifact ?? null;
}

export async function getChallengeCases() {
  const report = JSON.parse(await readFile(path.join(root, "reports", "relia-benchmark.json"), "utf8"));
  const cases = report.caseResults.filter((item) => item.systems.relia.score.correct && !item.systems.flat.score.correct).map((item) => ({
    id: item.id, category: item.category, question: item.question, input: item.input,
    expectedDecision: item.expected.decision, flatDecision: item.systems.flat.decision,
    keywordDecision: item.systems.keyword.decision, reliaDecision: item.systems.relia.decision,
  }));
  return { summary: { caseCount: report.caseCount, reviewedCaseCount: report.reviewedCaseCount, keywordAccuracy: report.systems.keyword.metrics.accuracy, flatAccuracy: report.systems.flat.metrics.accuracy, reliaAccuracy: report.systems.relia.metrics.accuracy }, cases };
}

export async function challengeCase(id) {
  const item = (await getChallengeCases()).cases.find((candidate) => candidate.id === id);
  if (!item) throw new Error("Choose a reviewed case where relationship reasoning changed the result.");
  const contract = legacyInputToContract(item.input);
  const result = await createInvestigation(contract);
  return { ...item, investigation: result.investigation, artifact: result.artifact };
}

export function legacyInputToContract(input) {
  const stack = input.currentStack ?? {};
  const environment = {};
  const context = {};
  const knownContexts = new Set(["router", "proxy runtime", "proxy_runtime", "middleware present", "ppr", "next.js channel"]);
  for (const [key, value] of Object.entries(stack)) {
    const lower = key.toLowerCase();
    if (knownContexts.has(lower)) context[{ router: "router", "proxy runtime": "proxyRuntime", proxy_runtime: "proxyRuntime", "middleware present": "middlewarePresent", ppr: "ppr", "next.js channel": "nextjsChannel" }[lower]] = value;
    else {
      const normal = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const canonical = ({ nodejs: "node", react: "react", reactdom: "react-dom", typescript: "typescript" })[normal] ?? key;
      environment[canonical] = value;
    }
  }
  const change = input.proposedChanges?.[0] ?? {};
  const metadata = { ...(change.scope ? { scope: change.scope } : {}), ...(change.questionIntent || input.questionIntent ? { questionIntent: change.questionIntent ?? input.questionIntent } : {}) };
  return {
    subject: { technology: change.technology ?? "", from: change.from ?? "", to: change.to ?? "" },
    environment,
    context,
    requestedBy: "judge-ui",
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

/** Phase 4 response projection retained for /api/investigate clients. */
export async function investigateUpgrade(input) {
  const result = await createInvestigation(legacyInputToContract(input));
  const { investigation, artifact } = result;
  if (!artifact) return { decision: "UNRESOLVED", initialDecision: "UNRESOLVED", confidence: "LOW", summary: investigation.decision.summary, findings: [], proofTrace: [], unresolved: investigation.decision.unresolved, blockingFactors: [], evidence: [], sources: [], redTeam: investigation.attack, investigation, artifact: null };
  return {
    decision: artifact.decision,
    initialDecision: artifact.verification.redTeam.initialDecision,
    confidence: investigation.decision.confidence,
    summary: investigation.decision.summary,
    findings: artifact.findings,
    proofTrace: artifact.proof.trace,
    unresolved: investigation.decision.unresolved,
    blockingFactors: investigation.decision.blockingFactors,
    evidence: artifact.evidence,
    sources: artifact.provenance.sources,
    redTeam: artifact.verification.redTeam,
    investigation,
    artifact,
  };
}

export async function isDecisionArtifactValid(artifact) { return validateDecisionArtifact(artifact); }

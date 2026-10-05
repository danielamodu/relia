import { meetsRange } from "../reasoning/engine.mjs";

const entriesFor = (repo, retrieved) => retrieved.map((hit) => repo.allDocuments().find((document) => document._id === hit.id)).filter(Boolean);
const contains = (text, value) => String(text).toLowerCase().includes(String(value).toLowerCase());

/** Conservative decision from retrieved text alone. It cannot join references or establish exhaustiveness. */
export function decideFromFlatText(repo, testCase, retrieved) {
  const stack = testCase.input.currentStack;
  const change = testCase.input.proposedChanges[0];
  const documents = entriesFor(repo, retrieved);
  const blockers = [];
  const uncertainties = [];
  const evidence = [];

  for (const document of documents) {
    const text = `${document.title ?? ""} ${document.statement ?? ""} ${document.condition ?? ""} ${document.sourceEvidence ?? ""} ${document.versionRange ?? ""}`;
    const mentionsTarget = contains(text, `${change.technology} ${change.to}`);
    if (document._type === "requirement" && mentionsTarget) {
      const reference = String(document.requiredTechnology ?? "").replace(/^tech-/, "").replaceAll("-", "").toLowerCase();
      const stackEntry = Object.entries(stack)
        .filter(([name]) => name.toLowerCase() !== change.technology.toLowerCase())
        .map((entry) => ({ entry, normalized: entry[0].replace(/[^a-z0-9]/gi, "").toLowerCase() }))
        .filter(({ normalized }) => normalized === reference || normalized.startsWith(reference) || reference.startsWith(normalized))
        .sort((a, b) => Math.abs(a.normalized.length - reference.length) - Math.abs(b.normalized.length - reference.length))[0]?.entry;
      if (!stackEntry) {
        uncertainties.push(`Flat text found ${document._id}, but could not link its required technology to a declared stack value.`);
        continue;
      }
      evidence.push(document._id);
      const passes = meetsRange(String(stackEntry[1]), document.versionRange);
      if (passes === false) {
        const exceptionRecord = documents.find((candidate) => candidate._type === "exception" && contains(candidate.title, change.technology) && contains(candidate.title, change.to));
        const reactFamily = reference === "react" || reference === "reactdom";
        const below19 = Number.parseInt(String(stackEntry[1]), 10) < 19;
        if (reactFamily && below19 && exceptionRecord && String(stack.Router ?? stack.router ?? "").toLowerCase() === "pages") {
          evidence.push(exceptionRecord._id);
          uncertainties.push(`Flat evidence names a Pages Router exception, but its opaque references prevent verifying every peer package relationship.`);
        } else if (reactFamily && below19 && exceptionRecord && !stack.Router && !stack.router) {
          evidence.push(exceptionRecord._id);
          uncertainties.push(`Flat evidence names a router-specific exception, but router context is absent.`);
        } else blockers.push(`${stackEntry[0]} ${stackEntry[1]} fails ${document.versionRange} in ${document._id}.`);
      }
      else if (passes === null) uncertainties.push(`Flat text could not compare ${stackEntry[0]} ${stackEntry[1]} against ${document.versionRange}.`);
    }
    if (document._type === "compatibilityRule" && mentionsTarget) {
      evidence.push(document._id);
      if (document.outcome === "incompatible" && /edge/i.test(document.condition ?? "") && /proxy/i.test(document.condition ?? "")) {
        const runtime = stack["Proxy runtime"] ?? stack.proxy_runtime;
        if (String(runtime ?? "").toLowerCase() === "edge") blockers.push(document.statement);
        else if (!runtime) uncertainties.push(`Flat text found conditional rule ${document._id}, but Proxy runtime is absent.`);
      }
    }
  }

  if (change.scope === "compatibility-only" && !blockers.length) {
    const candidate = documents.find((document) => document._type === "compatibilityRule" && document.outcome !== "incompatible" && contains(`${document.title ?? ""} ${document.statement ?? ""}`, `${change.technology} ${change.to}`));
    if (candidate) {
      evidence.push(candidate._id);
      // A flat record cannot establish that opaque referenced versions and their conditions match.
      uncertainties.push(`Flat record ${candidate._id} contains opaque relationship IDs; its referenced peer versions and full condition could not be joined.`);
    } else uncertainties.push("No direct positive compatibility statement was retrieved.");
  } else if (!blockers.length && !uncertainties.length) {
    uncertainties.push("Flat retrieval does not prove that all target-version constraints, exceptions, and migrations have been checked.");
  }

  const decision = blockers.length ? "BLOCKED" : "UNRESOLVED";
  const sources = new Set();
  for (const document of documents) for (const source of document.sources ?? []) if (typeof source === "string") sources.add(source);
  return { decision, blockers, uncertainties, evidence: [...new Set(evidence)], sources: [...sources], proofTrace: [], redTeam: { status: "NOT_RUN", challenges: [] } };
}

export function keywordQuery(testCase) {
  const stackTerms = Object.entries(testCase.input.currentStack).flatMap(([name, value]) => [name, String(value)]);
  return [testCase.question, ...stackTerms, ...testCase.input.proposedChanges.flatMap(({ technology, from, to }) => [technology, from, to])].join(" ");
}

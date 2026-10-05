import { LocalKnowledgeRepository } from "../knowledge/LocalKnowledgeRepository.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repo = await LocalKnowledgeRepository.open();
const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const collections = ["sources", "technologies", "versions", "requirements", "compatibility", "breaking-changes", "migrations", "exceptions"];
const byId = Object.fromEntries(collections.map((name) => [name, new Map(repo.all(name).map((record) => [record._id, record]))]));
const sourceDomains = new Set(["nextjs.org", "react.dev", "nodejs.org", "typescriptlang.org"]);
const dateFields = ["publishedAt", "updatedAt", "accessedAt", "releaseDate", "validFrom", "validThrough"];
const validIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const globalIds = new Map();

for (const name of collections) {
  const records = repo.all(name);
  const ids = new Set();
  for (const record of records) {
    if (!record._id || ids.has(record._id)) fail(`${name}: missing or duplicate _id ${record._id ?? "(missing)"}`);
    ids.add(record._id);
    if (record._id && globalIds.has(record._id)) fail(`${record._id}: ID also used in ${globalIds.get(record._id)}; Sanity document IDs must be globally unique`);
    else if (record._id) globalIds.set(record._id, name);
    for (const field of dateFields) {
      if (record[field] != null && !validIsoDate(record[field])) {
        fail(`${record._id}: ${field} must be an ISO date, received ${record[field]}`);
      }
    }
    if (record.validFrom && record.validThrough && record.validFrom > record.validThrough) fail(`${record._id}: validFrom is after validThrough`);
  }
}

const need = (record, fields, collection) => {
  for (const field of fields) if (record[field] === undefined || record[field] === null || record[field] === "" || (Array.isArray(record[field]) && record[field].length === 0)) {
    fail(`${record._id} (${collection}): required field '${field}' is missing or empty`);
  }
};
const ref = (id, collection, owner, field) => {
  if (!byId[collection]?.has(id)) fail(`${owner}: ${field} references missing ${collection} record '${id}'`);
  return byId[collection]?.get(id);
};
const refs = (record, field, collection, owner = record._id) => {
  for (const id of record[field] ?? []) ref(id, collection, owner, field);
};

for (const item of repo.all("sources")) {
  need(item, ["title", "url", "publisher", "accessedAt", "sourceType"], "sources");
  try {
    const url = new URL(item.url);
    if (url.protocol !== "https:") fail(`${item._id}: source URL must use HTTPS`);
    if (![...sourceDomains].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) fail(`${item._id}: source host ${url.hostname} is outside the official-source allowlist`);
  } catch { fail(`${item._id}: invalid source URL`); }
  if (item.publishedAt && item.accessedAt && item.publishedAt > item.accessedAt) fail(`${item._id}: publication date is after retrieval date`);
  if (item.updatedAt && item.accessedAt && item.updatedAt > item.accessedAt) fail(`${item._id}: last-updated date is after retrieval date`);
}
for (const item of repo.all("technologies")) need(item, ["name", "slug"], "technologies");
for (const item of repo.all("versions")) {
  need(item, ["technology", "label", "sources"], "versions");
  ref(item.technology, "technologies", item._id, "technology");
  refs(item, "sources", "sources");
  if (item.releaseDate && !item.sources?.length) fail(`${item._id}: releaseDate has no provenance source`);
}

const sourcedFactCheck = (item, collection, singularRefs) => {
  if (!(item.statement || item.effect)) fail(`${item._id} (${collection}): missing source-backed statement/effect`);
  need(item, ["sourceEvidence", "sources"], collection);
  if ((item.sourceEvidence ?? "").trim().length < 20) fail(`${item._id}: sourceEvidence is too short to support an auditable claim`);
  refs(item, "sources", "sources");
  for (const [field, targetCollection] of Object.entries(singularRefs)) if (item[field]) ref(item[field], targetCollection, item._id, field);
};

for (const item of repo.all("requirements")) {
  sourcedFactCheck(item, "requirements", { subject: "versions", requiredTechnology: "technologies" });
  need(item, ["versionRange"], "requirements");
  const range = item.versionRange?.trim();
  if (range && !/^(?:>=|>|=|<=|<)\s*\d+(?:\.\d+){0,2}$/.test(range)) fail(`${item._id}: unsupported version range syntax '${range}'`);
}
for (const item of repo.all("compatibility")) {
  sourcedFactCheck(item, "compatibility", {});
  need(item, ["title", "appliesTo", "dependsOn", "outcome", "statement", "condition"], "compatibility");
  for (const id of item.appliesTo ?? []) ref(id, "versions", item._id, "appliesTo");
  for (const id of item.dependsOn ?? []) {
    const version = byId.versions.get(id);
    if (!version && !byId.technologies.has(id)) fail(`${item._id}: dependsOn references unknown technology/version '${id}'`);
  }
  for (const id of item.exceptions ?? []) ref(id, "exceptions", item._id, "exceptions");
  if (!["compatible", "incompatible", "conditional"].includes(item.outcome)) fail(`${item._id}: unknown compatibility outcome '${item.outcome}'`);
}
for (const item of repo.all("breaking-changes")) {
  sourcedFactCheck(item, "breaking-changes", {});
  need(item, ["title", "affectedVersions"], "breaking-changes");
  for (const id of item.affectedVersions ?? []) ref(id, "versions", item._id, "affectedVersions");
  for (const id of item.migrations ?? []) {
    const migration = ref(id, "migrations", item._id, "migrations");
    if (migration && !migration.requiredFor.includes(item._id)) fail(`${item._id}: migration '${id}' does not reciprocate through requiredFor`);
  }
}
for (const item of repo.all("migrations")) {
  sourcedFactCheck(item, "migrations", {});
  need(item, ["title", "appliesTo", "steps"], "migrations");
  for (const id of item.appliesTo ?? []) ref(id, "versions", item._id, "appliesTo");
  for (const id of item.requiredFor ?? []) {
    const change = ref(id, "breaking-changes", item._id, "requiredFor");
    if (change && !change.migrations.includes(item._id)) fail(`${item._id}: requiredFor '${id}' does not reciprocate through breaking-change migrations`);
  }
}
for (const item of repo.all("exceptions")) {
  sourcedFactCheck(item, "exceptions", {});
  need(item, ["title", "appliesTo", "condition", "effect"], "exceptions");
  for (const id of item.appliesTo ?? []) ref(id, "versions", item._id, "appliesTo");
}

// Version IDs are technology-scoped: catch accidental links to an unrelated version family.
for (const item of repo.all("requirements")) {
  const subject = byId.versions.get(item.subject);
  if (subject && subject.technology === item.requiredTechnology) fail(`${item._id}: requirement subject and required technology are the same technology`);
}
for (const item of repo.all("compatibility")) {
  const applies = (item.appliesTo ?? []).map((id) => byId.versions.get(id)).filter(Boolean);
  const deps = (item.dependsOn ?? []).map((id) => byId.versions.get(id)).filter(Boolean);
  if (applies.some((version) => deps.some((dependency) => dependency.technology === version.technology))) warnings.push(`${item._id}: compatibility rule links a version to another version of the same technology; review scope`);
}

// Identify semantic duplicates and potentially conflicting source-backed requirements.
const canonical = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const duplicateMap = new Map();
for (const collection of ["requirements", "compatibility", "breaking-changes", "migrations", "exceptions"]) {
  for (const item of repo.all(collection)) {
    const scopedSubject = collection === "requirements" ? `${item.subject}|${item.requiredTechnology}|${item.versionRange}` : (item.subject ?? item.title);
    const key = `${collection}|${canonical(scopedSubject)}|${canonical(item.statement ?? item.effect)}|${canonical(item.condition)}`;
    if (duplicateMap.has(key)) warnings.push(`possible duplicate: ${duplicateMap.get(key)} and ${item._id}`);
    else duplicateMap.set(key, item._id);
  }
}
const requirementGroups = new Map();
for (const item of repo.all("requirements")) {
  const key = `${item.subject}|${item.requiredTechnology}`;
  const prior = requirementGroups.get(key);
  if (prior && prior.versionRange !== item.versionRange) warnings.push(`conflicting requirement candidates ${prior._id} (${prior.versionRange}) and ${item._id} (${item.versionRange}); inspect scopes/exceptions`);
  else requirementGroups.set(key, item);
}
const compatibilityGroups = new Map();
for (const item of repo.all("compatibility")) {
  const key = `${[...item.appliesTo].sort().join(",")}|${[...item.dependsOn].sort().join(",")}`;
  const peers = compatibilityGroups.get(key) ?? [];
  for (const prior of peers) {
    const overlaps = (!prior.validThrough || !item.validFrom || prior.validThrough >= item.validFrom) && (!item.validThrough || !prior.validFrom || item.validThrough >= prior.validFrom);
    const sameCondition = canonical(prior.condition) === canonical(item.condition);
    if (overlaps && sameCondition && prior.outcome !== item.outcome) warnings.push(`conflicting compatibility outcomes ${prior._id} (${prior.outcome}) and ${item._id} (${item.outcome}); inspect source scope and dates`);
  }
  peers.push(item);
  compatibilityGroups.set(key, peers);
}

const allIds = new Set(collections.flatMap((name) => repo.all(name).map((item) => item._id)));
const benchmarkRoot = fileURLToPath(new URL("../../benchmark/", import.meta.url));
const seenCases = new Set();
let caseCount = 0;
try {
  const lines = (await readFile(path.join(benchmarkRoot, "cases.jsonl"), "utf8")).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#")) continue;
    caseCount += 1;
    let item;
    try { item = JSON.parse(line); } catch (error) { fail(`benchmark/cases.jsonl:${index + 1}: invalid JSON (${error.message})`); continue; }
    if (!item.id || seenCases.has(item.id)) fail(`benchmark/cases.jsonl:${index + 1}: missing or duplicate case id '${item.id ?? ""}'`);
    seenCases.add(item.id);
    if (!["SAFE", "BLOCKED", "UNRESOLVED"].includes(item.expected_status)) fail(`${item.id}: invalid or missing expected_status`);
    for (const id of [...(item.expected_evidence ?? []), ...(item.required_facts ?? []), ...(item.required_sources ?? [])]) if (!allIds.has(id)) fail(`${item.id}: benchmark evidence reference '${id}' is not a dataset record`);
  }
} catch (error) { fail(`benchmark/cases.jsonl: cannot read (${error.message})`); }
const draftCounts = { ANSWERABLE: 0, INSUFFICIENT_EVIDENCE: 0, INVALID: 0 };
try {
  const drafts = JSON.parse(await readFile(path.join(benchmarkRoot, "draft-review.json"), "utf8"));
  if (!Array.isArray(drafts) || drafts.length !== 20) fail(`benchmark/draft-review.json: expected 20 reviewed prompts, found ${drafts?.length ?? "non-array"}`);
  const draftIds = new Set();
  for (const item of drafts) {
    if (draftIds.has(item.id)) fail(`benchmark/draft-review.json: duplicate prompt id '${item.id}'`);
    draftIds.add(item.id);
    if (!(item.review_status in draftCounts)) fail(`${item.id}: invalid review_status '${item.review_status}'`);
    else draftCounts[item.review_status] += 1;
    if (item.review_status === "ANSWERABLE" && !["SAFE", "BLOCKED", "UNRESOLVED"].includes(item.expected_status)) fail(`${item.id}: answerable prompt needs an expected_status`);
    if (item.review_status !== "ANSWERABLE" && item.expected_status !== null) fail(`${item.id}: non-answerable prompt must have null expected_status`);
    for (const id of [...(item.expected_evidence ?? []), ...(item.required_facts ?? []), ...(item.required_sources ?? [])]) if (!allIds.has(id)) fail(`${item.id}: draft evidence reference '${id}' is not a dataset record`);
  }
} catch (error) { fail(`benchmark/draft-review.json: invalid JSON or unreadable (${error.message})`); }

const counts = Object.fromEntries(collections.map((name) => [name, repo.all(name).length]));
const relationshipCount = repo.queryRelationships().length;
console.log(`Dataset records: ${Object.values(counts).reduce((sum, count) => sum + count, 0)} (${Object.entries(counts).map(([name, count]) => `${name}=${count}`).join(", ")})`);
console.log(`Validated relationships: ${relationshipCount}`);
console.log(`Benchmark cases: ${caseCount}`);
console.log(`Reviewed draft prompts: ${draftCounts.ANSWERABLE} answerable, ${draftCounts.INSUFFICIENT_EVIDENCE} insufficient evidence, ${draftCounts.INVALID} invalid`);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (errors.length) {
  console.error(`DATA VALIDATION FAILED (${errors.length} errors)`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else console.log(`DATA VALIDATION PASSED${warnings.length ? ` (${warnings.length} review warning${warnings.length === 1 ? "" : "s"})` : ""}`);

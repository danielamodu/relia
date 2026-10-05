import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const today = "2026-10-04";
const root = resolve(import.meta.dirname, "../..", "data");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const [sources, technologies, versions, requirements, compatibility, breakingChanges, migrations, exceptions] = await Promise.all([
  read("sources/sources.json"),
  read("technologies/technologies.json"),
  read("versions/versions.json"),
  read("requirements/requirements.json"),
  read("compatibility/compatibility.json"),
  read("breaking-changes/breaking-changes.json"),
  read("migrations/migrations.json"),
  read("exceptions/exceptions.json"),
]);

const sourceById = new Map(sources.map((source) => [source._id, source]));
sourceById.delete("source-next154-release");
sourceById.set("source-react192-release", {
  _id: "source-react192-release",
  title: "React 19.2",
  url: "https://react.dev/blog/2025/10/01/react-19-2",
  publisher: "React Team",
  publishedAt: "2025-10-01",
  accessedAt: today,
  sourceType: "release-notes",
  authorityNotes: "Official React 19.2 release announcement; used with Next.js 16's statement that its App Router Canary includes React 19.2 features.",
});
for (const source of sourceById.values()) {
  source.accessedAt = today;
  if (source._id === "source-next15-upgrade" || source._id === "source-next16-upgrade") source.updatedAt = "2026-08-25";
  else delete source.updatedAt;
}

const techIds = new Set(technologies.map(({ _id }) => _id));
const versionById = new Map(versions.map((version) => [version._id, version]));
versionById.delete("version-next-15-4");
versionById.set("version-react-19-2", {
  _id: "version-react-19-2", technology: "tech-react", label: "19.2", releaseDate: "2025-10-01", lifecycle: "unknown", sources: ["source-react192-release"],
});
versionById.set("version-react-dom-19-2", {
  _id: "version-react-dom-19-2", technology: "tech-react-dom", label: "19.2", releaseDate: "2025-10-01", lifecycle: "unknown", sources: ["source-react192-release"],
});
for (const version of versionById.values()) {
  if (version._id === "version-node-20-9") version.lifecycle = "end-of-life";
}

const requirementIds = new Set(requirements.map(({ _id }) => _id));
const curatedRequirements = requirements.filter(({ _id }) => !["requirement-next15-react19", "requirement-next15-react-dom19"].includes(_id));
curatedRequirements.push(
  {
    _id: "requirement-next15-react19",
    subject: "version-next-15",
    requiredTechnology: "tech-react",
    versionRange: ">=19.0.0",
    statement: "The Next.js 15 upgrade guide specifies React 19 as the minimum for its documented upgrade path; the Next.js 15 release announcement separately documents a React 18 exception for Pages Router.",
    sourceEvidence: "Version 15 upgrade guide: minimum versions of react and react-dom are 19. Next.js 15 announcement: Pages Router maintains backward compatibility with React 18.",
    sources: ["source-next15-upgrade", "source-next15-release"],
  },
  {
    _id: "requirement-next15-react-dom19",
    subject: "version-next-15",
    requiredTechnology: "tech-react-dom",
    versionRange: ">=19.0.0",
    statement: "The Next.js 15 upgrade guide specifies React DOM 19 as the minimum for its documented upgrade path; the Next.js 15 release announcement separately documents a React 18 exception for Pages Router.",
    sourceEvidence: "Version 15 upgrade guide: minimum versions of react and react-dom are 19. Next.js 15 announcement: Pages Router maintains backward compatibility with React 18.",
    sources: ["source-next15-upgrade", "source-next15-release"],
  },
);
requirementIds.add("requirement-next15-react19");
requirementIds.add("requirement-next15-react-dom19");

const compatibilityById = new Map(compatibility.filter(({ _id }) => _id !== "compat-next15-16-react-install" && _id !== "compat-next154-node18-deprecated").map((rule) => [rule._id, rule]));
compatibilityById.set("compat-next15-app-react19", {
  _id: "compat-next15-app-react19",
  title: "Next.js 15.1 supports React 19 across both routers",
  appliesTo: ["version-next-15-1"],
  dependsOn: ["version-react-19", "version-react-dom-19"],
  outcome: "conditional",
  condition: "Next.js 15.1. Pages Router can use React 19 stable; App Router continues to use built-in React Canary releases that include stable React 19 changes and newer framework-validated features.",
  statement: "Next.js 15.1 announces React 19 stable support in both routers, while describing the App Router's built-in React Canary behavior separately.",
  sourceEvidence: "Next.js 15.1 release notes: React 19 stable may be used in the Pages Router; the App Router continues to provide React Canary releases that include all stable React 19 changes and newer framework-validated features.",
  exceptions: [],
  validFrom: "2024-12-10",
  sources: ["source-next151-release"],
});
compatibilityById.set("compat-next16-app-react19-2", {
  _id: "compat-next16-app-react19-2",
  title: "Next.js 16 App Router uses React Canary with React 19.2 features",
  appliesTo: ["version-next-16"],
  dependsOn: ["tech-react"],
  outcome: "conditional",
  condition: "App Router only; Next.js documents its latest React Canary with React 19.2 features and incremental stabilization. This does not establish an exact stable React/React DOM package version for every deployment.",
  statement: "The Next.js 16 upgrade guide states that the App Router uses the latest React Canary, which includes the newly released React 19.2 features.",
  sourceEvidence: "Next.js 16 upgrade guide, section “React 19.2”: “The App Router in Next.js 16 uses the latest React Canary release, which includes the newly released React 19.2 features.”",
  exceptions: [],
  sources: ["source-next16-upgrade", "source-react192-release"],
});
compatibilityById.set("compat-node20-eol-temporal", {
  _id: "compat-node20-eol-temporal",
  title: "Node.js 20 meets the Next.js 16 floor but is EOL",
  appliesTo: ["version-next-16"],
  dependsOn: ["version-node-20-9"],
  outcome: "conditional",
  condition: "Node.js 20.9 or later meets Next.js 16's stated minimum; as of the Node.js Releases page retrieved 2026-10-04, the Node.js 20 major line is EOL. Framework minimum satisfaction does not imply currently maintained runtime status.",
  statement: "Next.js 16's Node.js 20.9 minimum is met by the Node.js 20 line, but the Node.js project lists Node.js 20 as EOL as of this dataset's retrieval date.",
  sourceEvidence: "Next.js 16 guide lists Node.js 20.9+ as the minimum. Node.js Releases page lists v20 status as EOL; retrieved 2026-10-04.",
  exceptions: [],
  sources: ["source-next16-upgrade", "source-node-releases"],
});

const breakingById = new Map(breakingChanges.map((record) => [record._id, record]));
breakingById.delete("breaking-next16-ppr");
breakingById.set("breaking-react19-render", {
  _id: "breaking-react19-render",
  title: "React 19 removes ReactDOM.render",
  affectedVersions: ["version-react-19"],
  statement: "React 19 removes ReactDOM.render; applications using it must migrate to createRoot from react-dom/client.",
  sourceEvidence: "React 19 Upgrade Guide, “Removed: ReactDOM.render”: ReactDOM.render is removed in React 19 and directs users to ReactDOM.createRoot.",
  migrations: ["migration-reactdom-render"],
  sources: ["source-react19-upgrade"],
});
breakingById.set("breaking-next16-sitemap-id", {
  _id: "breaking-next16-sitemap-id",
  title: "Next.js 16 makes sitemap id asynchronous",
  affectedVersions: ["version-next-16"],
  statement: "Starting with Next.js 16, the id passed to a sitemap generating function is a Promise and must be awaited before use.",
  sourceEvidence: "Next.js 16 upgrade guide, “Async id parameter for sitemap”: the id is now Promise<string> and the example awaits it.",
  migrations: ["migration-next16-sitemap-id"],
  sources: ["source-next16-upgrade"],
});

const migrationById = new Map(migrations.map((record) => [record._id, record]));
migrationById.delete("migration-ppr-cache-components");
migrationById.set("migration-reactdom-render", {
  _id: "migration-reactdom-render",
  title: "Migrate ReactDOM.render to createRoot",
  appliesTo: ["version-react-19"],
  requiredFor: ["breaking-react19-render"],
  steps: ["Replace ReactDOM.render with createRoot from react-dom/client.", "Render through the root returned by createRoot."],
  statement: "The React 19 Upgrade Guide directs applications using ReactDOM.render to migrate to createRoot.",
  sourceEvidence: "React 19 Upgrade Guide shows the before/after migration from render imported from react-dom to createRoot imported from react-dom/client.",
  sources: ["source-react19-upgrade"],
});
migrationById.set("migration-next16-sitemap-id", {
  _id: "migration-next16-sitemap-id",
  title: "Await the sitemap id in Next.js 16",
  appliesTo: ["version-next-16"],
  requiredFor: ["breaking-next16-sitemap-id"],
  steps: ["Treat the sitemap generating function's id parameter as a Promise.", "Await id before converting or using it."],
  statement: "The Next.js 16 upgrade guide's before/after example changes synchronous id access to awaiting the id Promise.",
  sourceEvidence: "Next.js 16 guide: `const resolvedId = await id`; id is now Promise<string>.",
  sources: ["source-next16-upgrade"],
});

const exceptionById = new Map(exceptions.map((record) => [record._id, record]));
exceptionById.set("exception-next16-edge-middleware", {
  _id: "exception-next16-edge-middleware",
  title: "Keep middleware when the Edge runtime is required",
  appliesTo: ["version-next-16"],
  condition: "The existing middleware depends on the Edge runtime.",
  effect: "Do not migrate that middleware to proxy on the assumption that Edge is supported; the Next.js 16 guide says proxy runs on Node.js and advises keeping middleware to continue using Edge.",
  sourceEvidence: "Next.js 16 upgrade guide, “middleware to proxy”: Edge runtime is not supported in proxy; to continue using Edge, keep using middleware.",
  sources: ["source-next16-upgrade"],
});

const documents = [];
const withRefs = (record, referenceFields) => {
  const result = structuredClone(record);
  for (const [field, types] of Object.entries(referenceFields)) {
    if (!(field in result) || result[field] == null) continue;
    const wasArray = Array.isArray(result[field]);
    const list = wasArray ? result[field] : [result[field]];
    const references = list.map((id) => ({ _type: "reference", _ref: id }));
    result[field] = wasArray ? references : references[0];
    if (types && !list.every((id) => (types instanceof Set ? types.has(id) : true))) throw new Error(`Invalid reference in ${record._id}.${field}`);
  }
  return result;
};
const push = (type, record, refs = {}) => documents.push({ _type: type, ...withRefs(record, refs) });

for (const record of sourceById.values()) push("source", record);
for (const technology of technologies) push("technology", {
  _id: technology._id,
  name: technology.name,
  slug: { _type: "slug", current: technology.slug },
});
for (const record of versionById.values()) push("version", record, { technology: techIds, sources: sourceById });
for (const record of curatedRequirements) push("requirement", record, { subject: versionById, requiredTechnology: techIds, sources: sourceById });
for (const record of compatibilityById.values()) push("compatibilityRule", record, { appliesTo: versionById, dependsOn: new Set([...techIds, ...versionById.keys()]), exceptions: exceptionById, sources: sourceById });
for (const record of breakingById.values()) push("breakingChange", record, { affectedVersions: versionById, migrations: migrationById, sources: sourceById });
for (const record of migrationById.values()) push("migration", record, { appliesTo: versionById, requiredFor: breakingById, sources: sourceById });
for (const record of exceptionById.values()) push("exception", record, { appliesTo: versionById, sources: sourceById });

const allIds = new Set(documents.map(({ _id }) => _id));
if (allIds.size !== documents.length) throw new Error("Duplicate _id in prepared Sanity documents");
for (const document of documents) {
  const refs = Object.values(document).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => value && value._type === "reference");
  for (const ref of refs) if (!allIds.has(ref._ref)) throw new Error(`Dangling reference ${document._id} -> ${ref._ref}`);
}

const output = resolve(root, "sanity-ingestion.documents.json");
await writeFile(output, `${JSON.stringify(documents, null, 2)}\n`, "utf8");
const counts = Object.fromEntries([...new Set(documents.map(({ _type }) => _type))].sort().map((type) => [type, documents.filter(({ _type }) => _type === type).length]));
const relationshipCount = documents.reduce((count, document) => count + Object.values(document).flatMap((value) => Array.isArray(value) ? value : [value]).filter((value) => value && value._type === "reference").length, 0);
console.log(JSON.stringify({ output, counts, relationshipCount, records: documents.length }, null, 2));

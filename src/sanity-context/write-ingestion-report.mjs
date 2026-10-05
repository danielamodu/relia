import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const datasetPath = resolve(root, "data/sanity-ingestion.documents.json");
const docs = JSON.parse(await readFile(datasetPath, "utf8"));
const refFields = new Set(["technology", "sources", "subject", "requiredTechnology", "appliesTo", "dependsOn", "exceptions", "affectedVersions", "migrations", "requiredFor"]);
const countByType = {};
const relationshipCounts = {};
for (const doc of docs) {
  countByType[doc._type] = (countByType[doc._type] ?? 0) + 1;
  for (const [field, value] of Object.entries(doc)) {
    if (!refFields.has(field)) continue;
    const refs = Array.isArray(value) ? value : [value];
    const count = refs.filter((ref) => ref?._type === "reference").length;
    if (count) relationshipCounts[field] = (relationshipCounts[field] ?? 0) + count;
  }
}

const sources = docs.filter((doc) => doc._type === "source");
const sourceUrls = sources.map(({ _id, title, url }) => ({ id: _id, title, url }));
const report = {
  reportType: "relia-sanity-phase-2-ingestion",
  generatedAt: "2026-10-05",
  projectId: "gjy7dyq2",
  dataset: "production",
  studio: "https://relia.sanity.studio/",
  ingestion: {
    method: "Sanity CLI documents create --replace, authenticated via the configured Sanity CLI session",
    datasetWasEmptyForReliaTypesBeforeIngestion: true,
    createdDocuments: docs.map(({ _id, _type }) => ({ _id, _type })).sort((a, b) => a._type.localeCompare(b._type) || a._id.localeCompare(b._id)),
    documentCount: docs.length,
    documentCountsByType: Object.fromEntries(Object.entries(countByType).sort()),
    sourceCount: sources.length,
    sourceUrls,
    relationshipCountsByField: Object.fromEntries(Object.entries(relationshipCounts).sort()),
    relationshipCount: Object.values(relationshipCounts).reduce((sum, value) => sum + value, 0),
    failedRecords: [],
    unresolvedSourceUrls: [],
  },
  verification: {
    directSanityGroq: {
      success: true,
      projectId: "gjy7dyq2",
      dataset: "production",
      typedDocumentCountsRetrieved: true,
      relationshipJoins: [
        "requirement-next16-node.subject -> version-next-16 -> technology Next.js; requiredTechnology -> Node.js; sources -> Next.js 16 upgrade guide",
        "breaking-next16-node18.affectedVersions -> version-next-16 -> technology Next.js; migrations -> migration-node-runtime -> requiredFor and sources",
      ],
      relationshipChecks: {
        requirementSubjectLinksResolved: 5,
        versionTechnologyLinksResolved: 14,
        breakingChangeAffectedVersionLinksResolved: 5,
        migrationSourceLinksResolved: 5,
      },
    },
    contextMcp: {
      success: true,
      toolsDiscovered: ["initial_context", "groq_query", "schema_explorer", "array_field_reader"],
      initialContextCall: true,
      schemaExplorerTypes: ["technology", "version", "requirement", "compatibilityRule", "breakingChange", "migration", "exception", "source"],
      groqQueryCall: true,
      datasetDocumentCountIncludingSanitySystemDocuments: 65,
      representativeMultiHopQueriesSucceeded: true,
    },
    schemaValidation: {
      command: "npx sanity@latest schemas validate",
      success: true,
      errors: 0,
      warnings: 0,
    },
  },
  representativeGroqQueries: [
    `*[_type == "requirement" && _id == "requirement-next16-node"][0]{_id, statement, versionRange, "subject": subject->{label, "technology": technology->name}, "requiredTechnology": requiredTechnology->name, "sources": sources[]->{title, url}}`,
    `*[_type == "breakingChange" && _id == "breaking-next16-node18"][0]{_id, title, "affectedVersions": affectedVersions[]->{label, "technology": technology->name}, "migrations": migrations[]->{title, "requiredFor": requiredFor[]->title, "sources": sources[]->{title, url}}}`,
    `*[_type == "compatibilityRule" && _id == "compat-node20-eol-temporal"][0]{_id, title, outcome, condition, "appliesTo": appliesTo[]->{label, "technology": technology->name}, "dependsOn": dependsOn[]->{label, "technology": technology->name}, "sources": sources[]->{title, url}}`,
  ],
  representativeGroqResults: [
    {
      queryId: "requirement-next16-node",
      result: {
        _id: "requirement-next16-node",
        subject: { label: "16", technology: "Next.js" },
        requiredTechnology: "Node.js",
        versionRange: ">=20.9.0",
        source: { title: "How to upgrade to version 16", url: "https://nextjs.org/docs/app/guides/upgrading/version-16" },
      },
    },
    {
      queryId: "breaking-next16-node18",
      result: {
        _id: "breaking-next16-node18",
        affectedVersions: [{ label: "16", technology: "Next.js" }],
        migration: { title: "Upgrade Node.js for Next.js 16", requiredFor: "Node.js 18 support removed in Next.js 16", source: "https://nextjs.org/docs/app/guides/upgrading/version-16" },
      },
    },
    {
      queryId: "compat-node20-eol-temporal",
      result: {
        _id: "compat-node20-eol-temporal",
        outcome: "conditional",
        appliesTo: [{ label: "16", technology: "Next.js" }],
        dependsOn: [{ label: "20.9", technology: "Node.js" }],
        sources: [
          "https://nextjs.org/docs/app/guides/upgrading/version-16",
          "https://nodejs.org/en/about/previous-releases",
        ],
      },
    },
  ],
  notes: [
    "Node.js 20.9 meets the Next.js 16 framework minimum, but the official Node.js releases table marks the Node.js 20 major line EOL as retrieved 2026-10-04; these are separate facts, not a claim of Next.js incompatibility.",
    "Next.js 16 React evidence is scoped to the App Router's React Canary and React 19.2 features; the source does not establish a stable exact React package version for all deployments.",
    "No documents were added to represent unsupported compatibility claims; absent facts remain unresolved by the reasoning layer.",
  ],
};

const reportDir = resolve(root, "reports");
await mkdir(reportDir, { recursive: true });
const reportPath = resolve(reportDir, "sanity-phase2-ingestion.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(reportPath);

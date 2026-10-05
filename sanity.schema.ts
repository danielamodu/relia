import type { SchemaTypeDefinition } from "@sanity/types";

const sourceReferences = {
  name: "sources",
  title: "Sources",
  type: "array",
  of: [{ type: "reference", to: [{ type: "source" }] }],
  validation: (Rule: any) => Rule.min(1),
};

const sourceEvidence = {
  name: "sourceEvidence",
  title: "Supporting source excerpt",
  type: "text",
  description: "Short excerpt or precise section/table locator supporting the normalized statement.",
  validation: (Rule: any) => Rule.required(),
};

const definitions: SchemaTypeDefinition[] = [
  {
    name: "technology",
    title: "Technology",
    type: "document",
    fields: [
      { name: "name", title: "Name", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "slug", title: "Slug", type: "slug", options: { source: "name" }, validation: (Rule: any) => Rule.required() },
      { name: "ecosystem", title: "Ecosystem", type: "string" },
    ],
  },
  {
    name: "version",
    title: "Version",
    type: "document",
    fields: [
      { name: "technology", title: "Technology", type: "reference", to: [{ type: "technology" }], validation: (Rule: any) => Rule.required() },
      { name: "label", title: "Version label", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "releaseDate", title: "Release date", type: "date" },
      { name: "lifecycle", title: "Lifecycle", type: "string", options: { list: ["current", "supported", "maintenance", "end-of-life", "unknown"] } },
      sourceReferences,
    ],
  },
  {
    name: "requirement",
    title: "Requirement",
    type: "document",
    fields: [
      { name: "subject", title: "Subject version", type: "reference", to: [{ type: "version" }], validation: (Rule: any) => Rule.required() },
      { name: "requiredTechnology", title: "Required technology", type: "reference", to: [{ type: "technology" }], validation: (Rule: any) => Rule.required() },
      { name: "versionRange", title: "Required version range", type: "string", description: "Preserve the source's range expression; do not infer a normalized range without evidence.", validation: (Rule: any) => Rule.required() },
      { name: "statement", title: "Source-backed statement", type: "text", validation: (Rule: any) => Rule.required() },
      sourceEvidence,
      { name: "validFrom", title: "Valid from", type: "date" },
      { name: "validThrough", title: "Valid through", type: "date" },
      sourceReferences,
    ],
  },
  {
    name: "compatibilityRule",
    title: "Compatibility rule",
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "appliesTo", title: "Applies to version(s)", type: "array", of: [{ type: "reference", to: [{ type: "version" }] }] },
      { name: "dependsOn", title: "Depends on", type: "array", of: [{ type: "reference", to: [{ type: "technology" }, { type: "version" }] }] },
      { name: "outcome", title: "Outcome", type: "string", options: { list: ["compatible", "incompatible", "conditional"] }, validation: (Rule: any) => Rule.required() },
      { name: "condition", title: "Condition", type: "text" },
      { name: "statement", title: "Source-backed statement", type: "text", validation: (Rule: any) => Rule.required() },
      sourceEvidence,
      { name: "exceptions", title: "Exceptions", type: "array", of: [{ type: "reference", to: [{ type: "exception" }] }] },
      { name: "validFrom", title: "Valid from", type: "date" },
      { name: "validThrough", title: "Valid through", type: "date" },
      sourceReferences,
    ],
  },
  {
    name: "breakingChange",
    title: "Breaking change",
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "affectedVersions", title: "Affected versions", type: "array", of: [{ type: "reference", to: [{ type: "version" }] }], validation: (Rule: any) => Rule.required() },
      { name: "statement", title: "Change and impact", type: "text", validation: (Rule: any) => Rule.required() },
      sourceEvidence,
      { name: "migrations", title: "Migration(s)", type: "array", of: [{ type: "reference", to: [{ type: "migration" }] }] },
      sourceReferences,
    ],
  },
  {
    name: "migration",
    title: "Migration",
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "appliesTo", title: "Applies to version(s)", type: "array", of: [{ type: "reference", to: [{ type: "version" }] }] },
      { name: "requiredFor", title: "Required for breaking change(s)", type: "array", of: [{ type: "reference", to: [{ type: "breakingChange" }] }] },
      { name: "steps", title: "Migration steps", type: "array", of: [{ type: "text" }], validation: (Rule: any) => Rule.min(1) },
      { name: "statement", title: "Source-backed statement", type: "text", validation: (Rule: any) => Rule.required() },
      sourceEvidence,
      sourceReferences,
    ],
  },
  {
    name: "exception",
    title: "Exception",
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "appliesTo", title: "Applies to version(s)", type: "array", of: [{ type: "reference", to: [{ type: "version" }] }] },
      { name: "condition", title: "Required condition", type: "text", validation: (Rule: any) => Rule.required() },
      { name: "effect", title: "Effect", type: "text", validation: (Rule: any) => Rule.required() },
      sourceEvidence,
      { name: "validFrom", title: "Valid from", type: "date" },
      { name: "validThrough", title: "Valid through", type: "date" },
      sourceReferences,
    ],
  },
  {
    name: "source",
    title: "Source",
    type: "document",
    fields: [
      { name: "title", title: "Title", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "url", title: "URL", type: "url", validation: (Rule: any) => Rule.required() },
      { name: "publisher", title: "Publisher", type: "string", validation: (Rule: any) => Rule.required() },
      { name: "publishedAt", title: "Publication date", type: "date" },
      { name: "updatedAt", title: "Last updated date", type: "date" },
      { name: "accessedAt", title: "Accessed date", type: "date", validation: (Rule: any) => Rule.required() },
      { name: "sourceType", title: "Source type", type: "string", options: { list: ["official-docs", "release-notes", "migration-guide", "other"] }, validation: (Rule: any) => Rule.required() },
      { name: "authorityNotes", title: "Authority notes", type: "text" },
    ],
  },
];

export default definitions;

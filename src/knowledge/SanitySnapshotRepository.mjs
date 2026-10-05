import { readFile } from "node:fs/promises";
import path from "node:path";
import { KnowledgeRepository } from "./KnowledgeRepository.mjs";

const root = path.resolve(process.cwd(), "data");
const pathToSnapshot = path.join(root, "sanity-evidence-snapshot.json");

function resolveReferences(document) {
  const result = structuredClone(document);
  delete result._createdAt;
  delete result._updatedAt;
  delete result._rev;
  for (const [key, value] of Object.entries(result)) {
    if (Array.isArray(value)) result[key] = value.map((item) => item?._type === "reference" ? item._ref : item);
    else if (value?._type === "reference") result[key] = value._ref;
    else if (key === "slug" && value?._type === "slug") result[key] = value.current;
  }
  return result;
}

const typeToCollection = {
  technology: "technologies",
  version: "versions",
  requirement: "requirements",
  compatibilityRule: "compatibility",
  breakingChange: "breakingChanges",
  migration: "migrations",
  exception: "exceptions",
  source: "sources",
};

/** Offline, read-only projection of documents queried directly from Sanity. */
export class SanitySnapshotRepository extends KnowledgeRepository {
  #documents;
  #data;

  static async open() {
    const snapshot = JSON.parse(await readFile(pathToSnapshot, "utf8"));
    if (!Array.isArray(snapshot) || snapshot.length === 0) throw new Error(`Sanity evidence snapshot is empty: ${pathToSnapshot}`);
    const repository = new SanitySnapshotRepository();
    repository.#documents = snapshot.map(resolveReferences);
    repository.#data = Object.fromEntries(Object.values(typeToCollection).map((collection) => [collection, []]));
    for (const doc of repository.#documents) {
      const collection = typeToCollection[doc._type];
      if (!collection) continue;
      repository.#data[collection].push(doc);
    }
    const reliaCount = Object.values(repository.#data).reduce((count, rows) => count + rows.length, 0);
    if (reliaCount !== snapshot.length) throw new Error(`Snapshot contains unsupported or missing types (${reliaCount}/${snapshot.length} recognized).`);
    return repository;
  }

  #find(collection, idOrName) {
    const items = this.#data[collection];
    return items.find((item) => item._id === idOrName || item.name === idOrName || item.label === idOrName || item.slug === idOrName) ?? null;
  }
  #get(collection, filter = {}) {
    return this.#data[collection].filter((item) => Object.entries(filter).every(([key, value]) => {
      if (value === undefined || value === null) return true;
      const field = item[key];
      return Array.isArray(field) ? field.includes(value) : field === value;
    }));
  }

  getTechnology(idOrName) { return this.#find("technologies", idOrName); }
  getVersion(idOrIdLabel, technologyId) {
    const exact = this.#find("versions", idOrIdLabel);
    if (exact && (!technologyId || exact.technology === technologyId)) return exact;
    const technology = technologyId ? this.getTechnology(technologyId) : null;
    const matches = this.#data.versions.filter((version) => version.label === String(idOrIdLabel) && (!technology || version.technology === technology._id));
    return matches.length === 1 ? matches[0] : null;
  }
  getRequirements(filter = {}) { return this.#get("requirements", filter); }
  getCompatibilityRules(filter = {}) { return this.#get("compatibility", filter); }
  getBreakingChanges(filter = {}) { return this.#get("breakingChanges", filter); }
  getMigrations(filter = {}) { return this.#get("migrations", filter); }
  getExceptions(filter = {}) { return this.#get("exceptions", filter); }
  getSources(filter = {}) { return this.#get("sources", filter); }

  getTechnologyByVersion(versionId) {
    const version = this.getVersion(versionId);
    return version ? this.getTechnology(version.technology) : null;
  }
  getSourceFor(record, sourceId) {
    return (record.sources ?? []).includes(sourceId) ? this.#find("sources", sourceId) : null;
  }
  all(collection) {
    const key = collection === "breaking-changes" ? "breakingChanges" : collection;
    if (this.#data[key]) return this.#data[key];
    const type = Object.entries(typeToCollection).find(([, value]) => value === key)?.[0];
    if (type) return this.#documents.filter((doc) => doc._type === type);
    throw new Error(`Unknown collection: ${collection}`);
  }
  allDocuments() { return this.#documents; }
  getSnapshotMetadata() { return { source: pathToSnapshot, documents: this.#documents.length, retrievedFrom: "Sanity GROQ API", projectId: "gjy7dyq2", dataset: "production" }; }

  queryRelationships({ from, relationship, to } = {}) {
    const edges = [];
    for (const version of this.#data.versions) {
      edges.push({ from: version.technology, relationship: "hasVersion", to: version._id, recordId: version._id });
      for (const source of version.sources ?? []) edges.push({ from: version._id, relationship: "sourcedFrom", to: source, recordId: version._id });
    }
    for (const requirement of this.#data.requirements) {
      edges.push({ from: requirement.subject, relationship: "requires", to: requirement.requiredTechnology, recordId: requirement._id });
      for (const source of requirement.sources ?? []) edges.push({ from: requirement._id, relationship: "sourcedFrom", to: source, recordId: requirement._id });
    }
    for (const rule of this.#data.compatibility) {
      for (const version of rule.appliesTo ?? []) edges.push({ from: version, relationship: "appliesTo", to: rule._id, recordId: rule._id });
      for (const dependency of rule.dependsOn ?? []) edges.push({ from: rule._id, relationship: "dependsOn", to: dependency, recordId: rule._id });
      for (const exception of rule.exceptions ?? []) edges.push({ from: rule._id, relationship: "hasException", to: exception, recordId: rule._id });
      for (const source of rule.sources ?? []) edges.push({ from: rule._id, relationship: "sourcedFrom", to: source, recordId: rule._id });
    }
    for (const change of this.#data.breakingChanges) {
      for (const version of change.affectedVersions ?? []) edges.push({ from: version, relationship: "affectedBy", to: change._id, recordId: change._id });
      for (const migration of change.migrations ?? []) edges.push({ from: change._id, relationship: "migration", to: migration, recordId: change._id });
      for (const source of change.sources ?? []) edges.push({ from: change._id, relationship: "sourcedFrom", to: source, recordId: change._id });
    }
    for (const migration of this.#data.migrations) {
      for (const version of migration.appliesTo ?? []) edges.push({ from: migration._id, relationship: "appliesTo", to: version, recordId: migration._id });
      for (const change of migration.requiredFor ?? []) edges.push({ from: migration._id, relationship: "requiredFor", to: change, recordId: migration._id });
      for (const source of migration.sources ?? []) edges.push({ from: migration._id, relationship: "sourcedFrom", to: source, recordId: migration._id });
    }
    for (const exception of this.#data.exceptions) {
      for (const version of exception.appliesTo ?? []) edges.push({ from: version, relationship: "hasException", to: exception._id, recordId: exception._id });
      for (const source of exception.sources ?? []) edges.push({ from: exception._id, relationship: "sourcedFrom", to: source, recordId: exception._id });
    }
    return edges.filter((edge) => (from === undefined || edge.from === from) && (relationship === undefined || edge.relationship === relationship) && (to === undefined || edge.to === to));
  }
}

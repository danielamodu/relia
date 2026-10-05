import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { KnowledgeRepository } from "./KnowledgeRepository.mjs";

const root = fileURLToPath(new URL("../../data/", import.meta.url));
const files = {
  technologies: "technologies/technologies.json",
  versions: "versions/versions.json",
  requirements: "requirements/requirements.json",
  compatibility: "compatibility/compatibility.json",
  breakingChanges: "breaking-changes/breaking-changes.json",
  migrations: "migrations/migrations.json",
  exceptions: "exceptions/exceptions.json",
  sources: "sources/sources.json",
};

export class LocalKnowledgeRepository extends KnowledgeRepository {
  #data;

  static async open() {
    const repository = new LocalKnowledgeRepository();
    repository.#data = Object.fromEntries(await Promise.all(
      Object.entries(files).map(async ([key, relative]) => [key, JSON.parse(await readFile(path.join(root, relative), "utf8"))]),
    ));
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
    const matches = this.#data.versions.filter((v) => v.label === idOrIdLabel && (!technology || v.technology === technology._id));
    return matches.length === 1 ? matches[0] : null;
  }
  getRequirements(filter) { return this.#get("requirements", filter); }
  getCompatibilityRules(filter) { return this.#get("compatibility", filter); }
  getBreakingChanges(filter) { return this.#get("breakingChanges", filter); }
  getMigrations(filter) { return this.#get("migrations", filter); }
  getExceptions(filter) { return this.#get("exceptions", filter); }
  getSources(filter) { return this.#get("sources", filter); }

  queryRelationships({ from, relationship, to } = {}) {
    const edges = [];
    for (const item of this.#data.versions) {
      edges.push({ from: item.technology, relationship: "hasVersion", to: item._id, recordId: item._id });
      for (const source of item.sources) edges.push({ from: item._id, relationship: "sourcedFrom", to: source, recordId: item._id });
    }
    for (const item of this.#data.requirements) edges.push({ from: item.subject, relationship: "requires", to: item.requiredTechnology, recordId: item._id });
    for (const item of this.#data.compatibility) {
      for (const version of item.appliesTo) edges.push({ from: version, relationship: "appliesTo", to: item._id, recordId: item._id });
      for (const dependency of item.dependsOn) edges.push({ from: item._id, relationship: "dependsOn", to: dependency, recordId: item._id });
      for (const exception of item.exceptions) edges.push({ from: item._id, relationship: "hasException", to: exception, recordId: item._id });
    }
    for (const item of this.#data.breakingChanges) {
      for (const version of item.affectedVersions) edges.push({ from: version, relationship: "affectedBy", to: item._id, recordId: item._id });
      for (const migration of item.migrations) edges.push({ from: item._id, relationship: "migration", to: migration, recordId: item._id });
    }
    for (const item of this.#data.migrations) {
      for (const version of item.appliesTo) edges.push({ from: item._id, relationship: "appliesTo", to: version, recordId: item._id });
      for (const change of item.requiredFor) edges.push({ from: item._id, relationship: "requiredFor", to: change, recordId: item._id });
    }
    for (const item of this.#data.exceptions) for (const version of item.appliesTo) edges.push({ from: version, relationship: "hasException", to: item._id, recordId: item._id });
    for (const collection of ["requirements", "compatibility", "breakingChanges", "migrations", "exceptions"]) {
      for (const item of this.#data[collection]) for (const source of item.sources) edges.push({ from: item._id, relationship: "sourcedFrom", to: source, recordId: item._id });
    }
    return edges.filter((edge) => (from === undefined || edge.from === from) && (relationship === undefined || edge.relationship === relationship) && (to === undefined || edge.to === to));
  }

  all(collection) {
    const key = collection === "breaking-changes" ? "breakingChanges" : collection;
    if (!this.#data[key]) throw new Error(`Unknown collection: ${collection}`);
    return this.#data[key];
  }
}

const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Explicit relationship traversal over a KnowledgeRepository projection. */
export class EvidenceGraph {
  constructor(repository, snapshot) {
    this.repository = repository;
    this.snapshot = snapshot;
  }

  resolveTechnology(identifier) {
    const direct = this.repository.getTechnology(identifier);
    if (direct) return direct;
    const target = normalize(identifier);
    return this.repository.allDocuments().find((record) => record._type === "technology" && [record.name, record.slug, record._id].some((value) => normalize(value) === target)) ?? null;
  }

  resolveVersion(technologyIdentifier, label) {
    const technology = this.resolveTechnology(technologyIdentifier);
    if (!technology) return null;
    return this.repository.getVersion(label, technology._id);
  }

  findRequirements(versionId) { return this.repository.getRequirements({ subject: versionId }); }
  findCompatibilityRules(versionId) { return this.repository.getCompatibilityRules().filter((record) => (record.appliesTo ?? []).includes(versionId)); }
  findExceptions(versionId, ruleId) {
    return this.repository.getExceptions().filter((record) => (!versionId || (record.appliesTo ?? []).includes(versionId)) && (!ruleId || (record.appliesTo ?? []).includes(ruleId) || (record.rules ?? []).includes(ruleId)));
  }
  findBreakingChanges(versionId) { return this.repository.getBreakingChanges().filter((record) => (record.affectedVersions ?? []).includes(versionId)); }
  findMigrations(changeId) { return this.repository.getMigrations().filter((record) => (record.requiredFor ?? []).includes(changeId) || (record.appliesTo ?? []).includes(changeId)); }

  findRelatedEvidence(entityId) {
    const edges = this.repository.queryRelationships().filter((edge) => edge.from === entityId || edge.to === entityId);
    const records = new Set(edges.map((edge) => edge.recordId));
    return { edges, records: [...records].map((id) => this.document(id)).filter(Boolean) };
  }

  findContradictions(versionId) {
    const rules = this.findCompatibilityRules(versionId);
    const contradictions = [];
    for (const left of rules) for (const right of rules) {
      if (left._id >= right._id) continue;
      const opposite = left.outcome === "compatible" && right.outcome === "incompatible" || left.outcome === "incompatible" && right.outcome === "compatible";
      if (opposite && JSON.stringify(left.dependsOn ?? []) === JSON.stringify(right.dependsOn ?? [])) contradictions.push({ records: [left._id, right._id], outcomes: [left.outcome, right.outcome] });
    }
    return contradictions;
  }

  traceProvenance(documentIds) {
    const sourcesById = new Map(this.repository.getSources().map((source) => [source._id, source]));
    return [...new Set(documentIds)].flatMap((id) => {
      const record = this.document(id);
      if (!record) return [];
      return (record.sources ?? []).map((sourceId) => {
        const source = sourcesById.get(sourceId);
        return source ? { documentId: id, documentType: record._type, sourceId, sourceTitle: source.title, sourceUrl: source.url, publisher: source.publisher } : null;
      }).filter(Boolean);
    });
  }

  document(id) { return this.repository.allDocuments().find((record) => record._id === id) ?? null; }
  allDocuments() { return this.repository.allDocuments(); }
  getTechnology(identifier) { return this.resolveTechnology(identifier); }
  getVersion(label, technologyId) { return this.repository.getVersion(label, technologyId); }
  getRequirements(filter) { return this.repository.getRequirements(filter); }
  getCompatibilityRules(filter) { return filter?.appliesTo ? this.findCompatibilityRules(filter.appliesTo) : this.repository.getCompatibilityRules(filter); }
  getBreakingChanges(filter) { return filter?.affectedVersions ? this.findBreakingChanges(filter.affectedVersions) : this.repository.getBreakingChanges(filter); }
  getMigrations(filter) { return this.repository.getMigrations(filter); }
  getExceptions(filter) { return this.repository.getExceptions(filter); }
  getSources(filter) { return this.repository.getSources(filter); }
  queryRelationships(filter) { return this.repository.queryRelationships(filter); }
}

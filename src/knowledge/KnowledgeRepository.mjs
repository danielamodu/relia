/** Storage-independent read contract used by local reasoning and evaluation. */
export class KnowledgeRepository {
  getTechnology() { throw new Error("getTechnology() is not implemented"); }
  getVersion() { throw new Error("getVersion() is not implemented"); }
  getRequirements() { throw new Error("getRequirements() is not implemented"); }
  getCompatibilityRules() { throw new Error("getCompatibilityRules() is not implemented"); }
  getBreakingChanges() { throw new Error("getBreakingChanges() is not implemented"); }
  getMigrations() { throw new Error("getMigrations() is not implemented"); }
  getExceptions() { throw new Error("getExceptions() is not implemented"); }
  getSources() { throw new Error("getSources() is not implemented"); }
  queryRelationships() { throw new Error("queryRelationships() is not implemented"); }
}

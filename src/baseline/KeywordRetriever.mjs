const tokenize = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? []);

/** Deterministic keyword retriever over the local source metadata, excerpts, and normalized fact corpus. */
export class KeywordRetriever {
  constructor(repository) { this.repository = repository; }

  retrieve(query, { limit = 10 } = {}) {
    const wanted = tokenize(query);
    const documents = [];
    for (const collection of ["requirements", "compatibility", "breaking-changes", "migrations", "exceptions"]) {
      for (const item of this.repository.all(collection)) {
        const text = [item.title, item.statement, item.effect, item.condition, item.sourceEvidence, item.versionRange, ...(item.steps ?? [])].filter(Boolean).join(" ");
        const tokens = tokenize(text);
        const matched = [...wanted].filter((token) => tokens.has(token));
        if (matched.length) documents.push({ id: item._id, type: collection, text, source_ids: item.sources ?? [], score: matched.length / Math.max(1, wanted.size), matched_terms: matched });
      }
    }
    for (const source of this.repository.getSources()) {
      const text = [source.title, source.publisher, source.authorityNotes, source.url].filter(Boolean).join(" ");
      const matched = [...wanted].filter((token) => tokenize(text).has(token));
      if (matched.length) documents.push({ id: source._id, type: "source", text, source_ids: [source._id], score: matched.length / Math.max(1, wanted.size), matched_terms: matched });
    }
    return documents.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  }
}

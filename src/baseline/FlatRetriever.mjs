const tokenize = (text) => new Set(String(text).toLowerCase().match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? []);

function flatten(document) {
  const values = [];
  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith("_")) continue;
    if (Array.isArray(value)) values.push(`${key} ${value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(" ")}`);
    else if (value && typeof value === "object") values.push(`${key} ${JSON.stringify(value)}`);
    else values.push(`${key} ${value ?? ""}`);
  }
  return values.join(" ");
}

/** Keyword ranking across flat Sanity document text; references remain opaque IDs. */
export class FlatRetriever {
  constructor(repository) { this.repository = repository; }

  retrieve(query, { limit = 12 } = {}) {
    const wanted = tokenize(query);
    const documents = this.repository.allDocuments().map((document) => {
      const text = flatten(document);
      const tokens = tokenize(text);
      const matched = [...wanted].filter((token) => tokens.has(token));
      const phraseBoost = String(query).toLowerCase().split(/\s+/).filter((term) => term.length > 2 && text.toLowerCase().includes(term)).length;
      return { id: document._id, type: document._type, text, record: document, source_ids: document.sources?.map((source) => typeof source === "string" ? source : source?._ref).filter(Boolean) ?? [], score: (matched.length + phraseBoost * 0.25) / Math.max(1, wanted.size), matched_terms: matched };
    });
    return documents.filter((document) => document.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
  }
}

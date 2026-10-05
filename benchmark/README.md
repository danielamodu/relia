# Relia benchmark contract

`cases.jsonl` contains 12 reviewed executable cases rewritten from the earlier draft prompt set. Each label is tied to document IDs in the verified Sanity evidence snapshot. `case.schema.json` specifies the case shape. The runner also checks that expected evidence and source IDs exist in that snapshot.

## Evidence snapshot

`npm run benchmark` is offline. It reads `data/sanity-evidence-snapshot.json`, a direct GROQ export from project `gjy7dyq2`, dataset `production`, plus `sanity-evidence-snapshot.meta.json`. Refresh the snapshot only through the authenticated Sanity CLI and record its retrieved date and query metadata. `sanity-ingestion.documents.json` is the deterministic ingestion input; it is not the benchmark's evidence snapshot.

## Systems

- **Keyword** ranks source-backed fact excerpts using token overlap and uses a conservative text-only decision pass.
- **Flat retrieval** ranks serialized Sanity document text. Reference IDs remain opaque; no relationship dereferencing occurs.
- **Relia** traverses the typed snapshot relationships, checks version and conditional scope, attaches source provenance, then runs an independent red-team pass.

Both retrieval baselines use the same snapshot and top-10 retrieval cutoff. They are deterministic information-retrieval baselines, not model-based generic RAG. The report records retrieval content, decisions, evidence coverage, and case failures. Do not describe these results as a comparison against a hosted LLM.

## Adjudication rules

- `SAFE` is limited to a narrow, explicitly supported compatibility relationship whose version and conditions are present. It does not mean a whole-project upgrade is safe.
- `BLOCKED` requires a source-backed unmet version constraint or an active incompatibility.
- `UNRESOLVED` covers missing evidence, unknown relationships, unprovided conditions, or project-specific migration state that the stack alone cannot establish.
- Missing evidence never implies compatibility.
- The case set is a bounded, source-backed pilot. Labels were reviewed against Sanity documents by the implementation pass; they have not received independent external adjudication. Results do not estimate general ecosystem-wide accuracy.

## Commands

```bash
npm test
npm run benchmark
```

The runner writes `reports/relia-benchmark.json`, `reports/relia-benchmark.md`, and `reports/relia-ablation.json` with exact cases, decisions, retrieved evidence, proof traces, source provenance, metrics, and failures.

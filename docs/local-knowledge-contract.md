# Relia local reasoning and proof contract

## Offline evidence boundary

`SanitySnapshotRepository` reads `data/sanity-evidence-snapshot.json`, a direct GROQ export of the verified Sanity dataset. It resolves Sanity reference objects to document IDs in memory while retaining the original document IDs, types, source records, and version scopes. The benchmark requires no credentials or network access after the snapshot has been retrieved.

The benchmark snapshot is checked in with `data/sanity-evidence-snapshot.meta.json`, which identifies the project, dataset, retrieval date, GROQ query, and count. `data/sanity-ingestion.documents.json` is a prepared write payload and is not used by the benchmark as evidence.

## Reasoning contract

Input:

```json
{
  "currentStack": { "Node.js": "22", "TypeScript": "5.1" },
  "proposedChanges": [
    { "technology": "Next.js", "from": "15", "to": "16" }
  ]
}
```

`investigate(repository, input)` returns `decision` (`SAFE`, `BLOCKED`, or `UNRESOLVED`), ordinal confidence (`HIGH` or `LOW`), source-backed findings, proof trace, unresolved questions, source records, and red-team results. Numeric range comparisons handle simple source expressions such as `>=20.9.0`; unsupported expressions abstain.

- `BLOCKED` requires a retrieved unmet requirement or active incompatibility.
- `UNRESOLVED` is used when a requirement, condition, relationship, version, lifecycle detail, or project migration state cannot be established. Missing evidence never produces `SAFE`.
- `SAFE` is limited to a narrowly scoped compatibility question when an explicit sourced compatibility relationship matches the supplied version and conditions. It does not certify the whole application upgrade.

## Proof traces

Each proof item contains the Sanity document ID and type, field and relationship used, source ID, source URL, and source title. Each finding carries the proof items supporting it. The trace contains retrieved facts and joins only; it does not expose hidden chain-of-thought.

## Red-team pass

After the initial constraint decision, Relia independently searches target-scoped breaking changes, linked migrations, conditional compatibility rules, exceptions, explicit version constraints, unknown context, and retrieved lifecycle states. A materially applicable constraint keeps or changes the final decision to `BLOCKED`; unverified migration, conditional, or temporal evidence changes a provisional `SAFE` to `UNRESOLVED`.

## Limits

The snapshot is intentionally bounded to Next.js 15 → 16, React, React DOM, Node.js, and TypeScript. It contains no application source/configuration state, so documented migration steps may remain unresolved even when the runtime/package floors pass. Benchmark results apply only to the reviewed 12-case corpus and this snapshot.

# Relia as Infrastructure

Relia is a verification layer for software-change decisions. It turns structured technical evidence into reproducible, machine-readable decisions that people and agents can act on. The [architecture diagram](../README.md#architecture) is maintained in the README as the single shareable diagram.

The UI, CLI, and HTTP API call the same investigation service. A request is validated as a ChangeContract, resolved through the EvidenceGraph, evaluated by the deterministic engine, challenged by the existing red-team pass, and returned as a VerifiedDecisionArtifact with proof and provenance.

Sanity is load-bearing because typed relationships, version scope, exceptions, and source references survive retrieval and can be traversed across multiple records. Flat retrieval is `document → answer`; Relia is `structured relationships → investigation → attack → verified decision → proof`. The live Sanity Context connection has been smoke-tested; deterministic investigations use the checked-in snapshot queried from the same Sanity project and dataset.

## Detailed implementation

## ChangeContract

The JSON Schema is [schemas/change-contract.schema.json](../schemas/change-contract.schema.json); the TypeScript declaration is [src/application/contracts.d.ts](../src/application/contracts.d.ts). A contract contains:

- `subject`: technology identifier plus current and proposed version labels.
- `environment`: technology/version pairs such as `node`, `react`, `react-dom`, and `typescript`.
- `context`: conditions such as router, runtime, and migration context.
- Optional `requestedBy` and `metadata`.

Unknown keys are retained for provenance. Unknown technology relationships yield UNRESOLVED rather than implicit compatibility. Validation rejects missing or malformed fields and identical current/target versions. Canonical serialization trims string values and recursively sorts object keys; object property ordering therefore does not alter a contract's canonical form. The investigation fingerprint hashes this canonical contract with the evidence snapshot identity.

## EvidenceGraph

[EvidenceGraph](../src/infrastructure/EvidenceGraph.mjs) wraps the storage-neutral `KnowledgeRepository` view of the checked-in Sanity snapshot. It exposes deterministic operations:

- `resolveTechnology()` and `resolveVersion()` map identifiers to the structured records.
- `findRequirements()` and `findCompatibilityRules()` follow the target version's references.
- `findExceptions()` resolves version/rule-scoped exceptions.
- `findBreakingChanges()` and `findMigrations()` follow affected-version and required-for links.
- `findRelatedEvidence()` returns adjacent records and relationship edges.
- `findContradictions()` checks same-version rules for opposing outcomes under matching dependencies.
- `traceProvenance()` resolves records to source IDs, titles, publishers, and URLs.

The reasoning engine receives this graph interface, not filesystem paths or snapshot JSON. Document IDs, types, reference edges, version scopes, lifecycle fields, source references, and source URLs remain intact. The graph does not duplicate the Sanity dataset.

## Investigation lifecycle

`createInvestigation()` in [src/application/relia-service.mjs](../src/application/relia-service.mjs) performs the following sequence:

1. Validate and normalize the ChangeContract.
2. Load the immutable local evidence snapshot and calculate its content SHA-256 identity.
3. Resolve the current and proposed versions and translate the contract into the existing reasoning-engine input.
4. Run the existing engine, which collects evidence, forms a provisional decision, searches for challenges, and returns the final decision.
5. Enrich the proof with source titles/URLs and retain the traversed relationships.
6. Validate the VerifiedDecisionArtifact schema and persist the completed investigation under `.relia/investigations/`.

The investigation stores the canonical contract, status, timestamps, snapshot identity, provisional and final decisions, findings, red-team results, proof trace, and provenance. IDs are deterministic from the contract and snapshot fingerprint. The timestamp is execution metadata and may differ on a replay.

If snapshot loading or mandatory red-team execution fails, the service returns a FAILED investigation with an UNRESOLVED decision and `attack.status: FAILED`; it does not issue an artifact. Missing/unsupported source evidence remains UNRESOLVED. The artifact's `verification.redTeam` proves the pass executed; `CHALLENGE_FOUND` means the pass found a challenge, not that it failed to run.

## VerifiedDecisionArtifact

The schema is [schemas/verified-decision-artifact.schema.json](../schemas/verified-decision-artifact.schema.json). Version 1 includes:

- decision and proposed subject;
- concise findings, explicit constraints, evidence document IDs/types, and structured graph relationships;
- source-linked proof trace with document ID/type, field, relationship, source ID, and URL;
- mandatory red-team status, execution marker, challenges, initial decision, and final decision;
- snapshot hash, source list, document list, canonical contract, and timestamp.

Artifacts are JSON serializable and validated with Ajv before return. Canonical JSON sorts object keys deterministically. The SHA-256 fingerprint is a reproducibility identifier over the canonical contract and exact local snapshot bytes; it is not a signature or a claim that an artifact has been externally authenticated.

## Evidence and Sanity Context

The Sanity project is `gjy7dyq2.production`. Sanity Context MCP's `initial_context`, `schema_explorer`, and GROQ query tools were verified in the previous phase. The repository's deterministic investigation runtime intentionally reads [data/sanity-evidence-snapshot.json](../data/sanity-evidence-snapshot.json), previously queried from the Sanity project, so UI/API/CLI runs do not depend on network availability. The snapshot metadata records project, dataset, retrieval date, query, and count; each investigation additionally hashes the full snapshot content.

There are no Sanity writes, live Context calls, fallback fixtures, or synthetic content in the investigation path. Refreshing the snapshot is a separate evidence-ingestion operation. The source documents remain authoritative and independently linked from each proof item.

## Versioned API

All routes run in the Node.js runtime and use explicit JSON errors:

| Method | Route | Result |
| --- | --- | --- |
| `POST` | `/api/v1/investigations` | Validate a ChangeContract; return Investigation and artifact, or an explicit FAILED result. Invalid contracts return 400. |
| `GET` | `/api/v1/investigations/:id` | Retrieve a stored investigation; missing IDs return 404. |
| `POST` | `/api/v1/investigations/:id/attack` | Replay the stored contract through the same mandatory investigation/red-team service. |
| `GET` | `/api/v1/investigations/:id/proof` | Return the machine-readable proof and provenance. |
| `GET` | `/api/v1/investigations/:id/artifact` | Return the validated artifact; failed investigations return 409 because no artifact exists. |

Phase 4 `/api/investigate` and `/api/challenge` remain compatibility routes. The judge UI uses the versioned API for investigation creation, red-team replay, and proof retrieval. Benchmark case discovery remains on `/api/challenge`; replayed cases are sent to `/api/v1/investigations`.

The local JSON store is intentionally small and single-machine. It is not a cloud database, multi-tenant store, authenticated API, or signed artifact registry.

## CLI

The CLI [src/cli.mjs](../src/cli.mjs) calls the same application service as the HTTP API:

```bash
npm run relia -- investigate --technology nextjs --from 15 --to 16 --node 20.8 --react 19 --router pages --typescript 5.1
npm run relia -- investigate --technology nextjs --from 15 --to 16 --node 20.8 --react 19 --router pages --typescript 5.1 --json
npm run demo:infrastructure
```

Normal output includes decision, concise findings, red-team status, investigation ID/fingerprint, and proof summary. `--json` prints the full artifact. The demo runs the three reviewed upgrade examples offline.

## UI relationship

The Next.js judge experience sends a ChangeContract to `/api/v1/investigations`. It renders the returned Investigation and VerifiedDecisionArtifact, asks the proof endpoint for an inspectable relationship trace, and replays the mandatory attack endpoint when the user asks to inspect the red-team result. React components contain presentation and input mapping only; they do not evaluate compatibility rules or decide outcomes.

## Boundaries

- The existing Phase 3 deterministic reasoning engine and benchmark labels remain the decision and evaluation basis.
- No authentication, accounts, queues, cloud database, LLM, generic agent framework, or additional technology corpus is part of this layer.
- The reviewed 12-case benchmark remains a pilot; its percentages do not establish general ecosystem performance.

# Relia benchmark results

Generated: 2026-10-05T01:43:33.128Z
Sanity evidence snapshot: gjy7dyq2.production; retrieved 2026-10-05; 52 documents. Benchmark execution was offline.

Cases: 12 (8 answerable, 4 insufficient-evidence). Retrieval top K: 10.

## System metrics

| System | Accuracy | SAFE precision | BLOCKED precision | UNRESOLVED precision | Evidence coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| Keyword | 66.7% (8/12) | n/a | 100.0% | 55.6% | 63.6% |
| Flat retrieval | 66.7% (8/12) | n/a | 100.0% | 55.6% | 63.6% |
| Relia | 100.0% (12/12) | 100.0% | 100.0% | 100.0% | 100.0% |

Relia proof-trace completeness: 100.0%. Red-team challenge detection accuracy: 100.0% (10 detected, 0 missed, 0 unexpected challenges).
Relationship ablation: FULL 100.0%; ABLATED 66.7%; difference 33.3 percentage points. Relationship-aware wins: 4; flat wins: 0.

## Case results

| Case | Expected | Keyword | Flat | Relia | Red team |
| --- | --- | --- | --- | --- | --- |
| c01-next151-react19-pages | SAFE | UNRESOLVED ✗ | UNRESOLVED ✗ | SAFE ✓ | PASSED ✓ |
| c02-next16-node-floor | BLOCKED | UNRESOLVED ✗ | UNRESOLVED ✗ | BLOCKED ✓ | CHALLENGE_FOUND ✓ |
| c03-next16-typescript-floor | BLOCKED | BLOCKED ✓ | BLOCKED ✓ | BLOCKED ✓ | CHALLENGE_FOUND ✓ |
| c04-next16-removes-node18 | BLOCKED | UNRESOLVED ✗ | UNRESOLVED ✗ | BLOCKED ✓ | CHALLENGE_FOUND ✓ |
| c05-next16-proxy-edge | BLOCKED | BLOCKED ✓ | BLOCKED ✓ | BLOCKED ✓ | CHALLENGE_FOUND ✓ |
| c06-next16-proxy-runtime-unknown | UNRESOLVED | UNRESOLVED ✓ | UNRESOLVED ✓ | UNRESOLVED ✓ | CHALLENGE_FOUND ✓ |
| c07-next15-pages-react18 | SAFE | UNRESOLVED ✗ | UNRESOLVED ✗ | SAFE ✓ | PASSED ✓ |
| c08-next15-react18-app-router | BLOCKED | BLOCKED ✓ | BLOCKED ✓ | BLOCKED ✓ | CHALLENGE_FOUND ✓ |
| c09-next15-react18-router-unknown | UNRESOLVED | UNRESOLVED ✓ | UNRESOLVED ✓ | UNRESOLVED ✓ | CHALLENGE_FOUND ✓ |
| c10-next16-node20-eol | UNRESOLVED | UNRESOLVED ✓ | UNRESOLVED ✓ | UNRESOLVED ✓ | CHALLENGE_FOUND ✓ |
| c11-next16-react-exact-floor | UNRESOLVED | UNRESOLVED ✓ | UNRESOLVED ✓ | UNRESOLVED ✓ | CHALLENGE_FOUND ✓ |
| c12-unknown-vite-relationship | UNRESOLVED | UNRESOLVED ✓ | UNRESOLVED ✓ | UNRESOLVED ✓ | CHALLENGE_FOUND ✓ |

## Failures

- Keyword: c01-next151-react19-pages expected SAFE, got UNRESOLVED; c02-next16-node-floor expected BLOCKED, got UNRESOLVED; c04-next16-removes-node18 expected BLOCKED, got UNRESOLVED; c07-next15-pages-react18 expected SAFE, got UNRESOLVED
- Flat retrieval: c01-next151-react19-pages expected SAFE, got UNRESOLVED; c02-next16-node-floor expected BLOCKED, got UNRESOLVED; c04-next16-removes-node18 expected BLOCKED, got UNRESOLVED; c07-next15-pages-react18 expected SAFE, got UNRESOLVED
- Relia: none
- Red team: none

## Relia unresolved cases

- c06-next16-proxy-runtime-unknown: The stack does not specify TypeScript, required to evaluate requirement-next16-typescript. The condition for compat-next16-proxy-edge-incompatible cannot be confirmed from the supplied stack. The target has a documented breaking change: Middleware convention renamed to Proxy in Next.js 16. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. The target has a documented breaking change: Node.js 18 support removed in Next.js 16. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. The target has a documented breaking change: Next.js 16 makes sitemap id asynchronous. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. Condition remains unverified: App Router only; Next.js documents its latest React Canary with React 19.2 features and incremental stabilization. This does not establish an exact stable React/React DOM package version for every deployment. Condition remains unverified: Node.js 20.9 or later meets Next.js 16's stated minimum; as of the Node.js Releases page retrieved 2026-10-04, the Node.js 20 major line is EOL. Framework minimum satisfaction does not imply currently maintained runtime status. Cannot recheck requirement-next16-typescript: stack value for TypeScript is absent.
- c09-next15-react18-router-unknown: Router is unspecified; exception-next15-pages-react18 applies only to Pages Router. The React 18 exception is router-scoped, but the supplied stack omits the router type. The React 18 exception cannot be confirmed because Router is not supplied. The React 18 exception cannot be confirmed because Router is not supplied.
- c10-next16-node20-eol: The condition for compat-next16-proxy-edge-incompatible cannot be confirmed from the supplied stack. The target has a documented breaking change: Middleware convention renamed to Proxy in Next.js 16. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. The target has a documented breaking change: Node.js 18 support removed in Next.js 16. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. The target has a documented breaking change: Next.js 16 makes sitemap id asynchronous. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. Node.js 20.9 is marked end-of-life in the retrieved official lifecycle snapshot; this is operational risk, not a claim of framework incompatibility.
- c11-next16-react-exact-floor: The condition for compat-next16-app-react19-2 cannot be confirmed from the supplied stack. The condition for compat-next16-proxy-edge-incompatible cannot be confirmed from the supplied stack. The target has a documented breaking change: Middleware convention renamed to Proxy in Next.js 16. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. The target has a documented breaking change: Node.js 18 support removed in Next.js 16. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. The target has a documented breaking change: Next.js 16 makes sitemap id asynchronous. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete. Condition remains unverified: Node.js 20.9 or later meets Next.js 16's stated minimum; as of the Node.js Releases page retrieved 2026-10-04, the Node.js 20 major line is EOL. Framework minimum satisfaction does not imply currently maintained runtime status.
- c12-unknown-vite-relationship: No technology, version, or compatibility relationship for the requested package is present in the verified Sanity snapshot.

## Limits

Keyword and flat systems are deterministic retrieval baselines, not model-based RAG. Flat retrieval leaves Sanity references opaque. Results measure this reviewed 12-case corpus and retrieved snapshot only; they do not establish broad ecosystem coverage or general performance beyond these cases.

Full per-case records, retrieved evidence, proof traces, sources, and red-team challenges are in `relia-benchmark.json`. Ablation records are in `relia-ablation.json`.

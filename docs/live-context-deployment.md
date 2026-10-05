# Live Sanity Context mode

Production investigations query the Sanity Context MCP endpoint on every request. The GROQ query scopes retrieval to the proposed target version, technologies named in the environment, linked requirements, compatibility rules, breaking changes, migrations, exceptions, and source records. The response is checked for project `gjy7dyq2`, dataset `production`, and supported Relia document types before it reaches the existing `KnowledgeRepository` reasoning boundary. A failed or empty live query fails the investigation; production never silently falls back to the checked-in snapshot.

## Vercel configuration

In the Vercel project, add these environment variables for **Production** (and Preview if you want previews to query Sanity):

| Name | Value |
| --- | --- |
| `RELIA_KNOWLEDGE_SOURCE` | `context-mcp` |
| `SANITY_CONTEXT_MCP_URL` | `https://api.sanity.io/v1/context/organizations/ogayqhinh/mcp/relia` |
| `SANITY_ORGANIZATION_TOKEN` | A rotated organization token with Context Viewer access; store as a secret |

Do not put the token in Git, client-side variables, or deployment logs. Redeploy after setting the variables. Do not install Vercel's optional Sanity CMS integration for this MCP path; it provisions Content Lake API tokens and is separate from the Context Viewer token used here.

## Modes

- Production defaults to `context-mcp`; missing credentials or MCP/query failures produce an explicit failed investigation.
- Local development and tests default to the checked-in Sanity snapshot so the benchmark stays deterministic. Set `RELIA_KNOWLEDGE_SOURCE=context-mcp` locally to exercise live requests.
- The benchmark runner continues to evaluate the fixed snapshot and does not claim to benchmark network variability.

Each live result carries the retrieved document count, retrieval time, and a content hash in its evidence snapshot metadata. Its artifact fingerprint includes that content hash, so a dataset change changes the evidence identity.

import { createHash } from "node:crypto";
import { SanitySnapshotRepository } from "../knowledge/SanitySnapshotRepository.mjs";

const expectedTypes = ["technology", "version", "requirement", "compatibilityRule", "breakingChange", "migration", "exception", "source"];
const expectedProject = "gjy7dyq2";
const expectedDataset = "production";
const knownSlugs = new Map([
  ["nextjs", "nextjs"], ["next", "nextjs"],
  ["node", "nodejs"], ["nodejs", "nodejs"],
  ["react", "react"], ["reactdom", "react-dom"],
  ["typescript", "typescript"], ["ts", "typescript"],
]);

const normalizeIdentifier = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildContractScopedQuery(contract) {
  const slugs = [...new Set([
    knownSlugs.get(normalizeIdentifier(contract.subject.technology)),
    ...Object.keys(contract.environment ?? {}).map((key) => knownSlugs.get(normalizeIdentifier(key))),
  ].filter(Boolean))];
  const targetSlug = knownSlugs.get(normalizeIdentifier(contract.subject.technology));
  const targetVersionIds = targetSlug
    ? `*[_type == "version" && technology->slug.current == ${JSON.stringify(targetSlug)} && label == ${JSON.stringify(String(contract.subject.to))}]._id`
    : "[]";
  const targetRules = `*[_type == "compatibilityRule" && references(${targetVersionIds})]._id`;
  const targetBreakingChanges = `*[_type == "breakingChange" && references(${targetVersionIds})]._id`;
  const relevantDocuments = [
    `*[_type == "technology" && slug.current in ${JSON.stringify(slugs)}]`,
    `*[_type == "version" && technology->slug.current in ${JSON.stringify(slugs)}]`,
    `*[_type == "requirement" && references(${targetVersionIds})]`,
    `*[_type == "compatibilityRule" && references(${targetVersionIds})]`,
    `*[_type == "breakingChange" && references(${targetVersionIds})]`,
    `*[_type == "migration" && references(${targetBreakingChanges})]`,
    `*[_type == "exception" && (references(${targetVersionIds}) || references(${targetRules}))]`,
    `*[_type == "source"]`,
  ];
  return `{ "projectId": sanity::projectId(), "dataset": sanity::dataset(), "documents": (${relevantDocuments.join(" + ")}) | order(_type asc, _id asc) }`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function parseRpcResponse(body, contentType, expectedId) {
  if (contentType.includes("application/json")) return JSON.parse(body);
  if (contentType.includes("text/event-stream")) {
    const messages = body.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return messages.find((message) => message.id === expectedId) ?? messages.at(-1);
  }
  throw new Error("Sanity Context returned an unsupported response format.");
}

function unpackToolResult(result) {
  if (result?.isError) throw new Error("Sanity Context GROQ query failed.");
  if (result?.structuredContent !== undefined) {
    const structured = result.structuredContent;
    return structured?.result ?? structured?.documents ?? structured;
  }
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("Sanity Context GROQ query returned no structured result.");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("Sanity Context GROQ result was not valid JSON."); }
  return parsed?.result ?? parsed?.documents ?? parsed;
}

/** Fetches the current, source-linked Relia documents through Sanity Context MCP for each investigation. */
export async function loadLiveSanityContextRepository(contract) {
  const endpointValue = process.env.SANITY_CONTEXT_MCP_URL;
  const token = process.env.SANITY_ORGANIZATION_TOKEN;
  if (!endpointValue || !token) throw new Error("Live Sanity Context is not configured. Set SANITY_CONTEXT_MCP_URL and SANITY_ORGANIZATION_TOKEN in the server environment.");

  let endpoint;
  try { endpoint = new URL(endpointValue); }
  catch { throw new Error("SANITY_CONTEXT_MCP_URL is not a valid URL."); }
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "api.sanity.io" || !/^\/v1\/context\/organizations\/[^/]+\/mcp\/[^/]+\/?$/.test(endpoint.pathname)) {
    throw new Error("SANITY_CONTEXT_MCP_URL must be the HTTPS Sanity Context endpoint from the Context app.");
  }

  let requestId = 1;
  async function rpc(method, params) {
    const id = requestId++;
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }),
        signal: AbortSignal.timeout(18000),
      });
    } catch {
      throw new Error("Sanity Context request failed. Check network access and the configured endpoint.");
    }
    if (!response.ok) {
      const reason = response.status === 401 ? "authentication failed (401)" : response.status === 403 ? "Context Viewer access was denied (403)" : `HTTP ${response.status}`;
      throw new Error(`Sanity Context request failed: ${reason}.`);
    }
    let payload;
    try { payload = parseRpcResponse(await response.text(), response.headers.get("content-type") ?? "", id); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "Sanity Context response could not be parsed."); }
    if (!payload || payload.id !== id) throw new Error("Sanity Context returned no matching JSON-RPC response.");
    if (payload.error) throw new Error(`Sanity Context returned JSON-RPC error ${payload.error.code}.`);
    return payload.result;
  }

  const query = buildContractScopedQuery(contract);
  const result = await rpc("tools/call", { name: "groq_query", arguments: { query } });
  const data = unpackToolResult(result);
  if (data?.projectId !== expectedProject || data?.dataset !== expectedDataset) {
    throw new Error(`Sanity Context returned the wrong dataset. Expected ${expectedProject}.${expectedDataset}.`);
  }
  const documents = data.documents;
  if (!Array.isArray(documents) || documents.length === 0) throw new Error("Sanity Context returned no Relia documents for the configured dataset.");
  const unsupportedTypes = [...new Set(documents.map((document) => document?._type))].filter((type) => !expectedTypes.includes(type));
  if (unsupportedTypes.length) throw new Error(`Sanity Context query returned unsupported Relia document types: ${unsupportedTypes.join(", ")}.`);

  const repository = SanitySnapshotRepository.fromDocuments(documents);
  const contentSha256 = createHash("sha256").update(JSON.stringify(stableValue(documents))).digest("hex");
  const retrievedAt = new Date().toISOString();
  const snapshot = {
    id: `sanity:${expectedProject}.${expectedDataset}:sha256:${contentSha256}`,
    projectId: expectedProject,
    dataset: expectedDataset,
    retrievedAt,
    documentCount: repository.allDocuments().length,
    contentSha256,
    retrieval: "Sanity Context MCP groq_query (contract-scoped live per investigation)",
    querySha256: createHash("sha256").update(query).digest("hex"),
    scope: { subject: contract.subject, environment: contract.environment ?? {}, context: contract.context ?? {} },
  };
  return { repository, snapshot };
}

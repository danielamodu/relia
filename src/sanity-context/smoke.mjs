const endpointValue = process.env.SANITY_CONTEXT_MCP_URL;
const organizationToken = process.env.SANITY_ORGANIZATION_TOKEN;

const missing = [
  !endpointValue && "SANITY_CONTEXT_MCP_URL",
  !organizationToken && "SANITY_ORGANIZATION_TOKEN",
].filter(Boolean);

if (missing.length > 0) {
  console.error(`Sanity Context smoke test cannot start: missing ${missing.join(" and ")}.`);
  process.exit(2);
}

let endpoint;
try {
  endpoint = new URL(endpointValue);
} catch {
  console.error("Sanity Context smoke test cannot start: SANITY_CONTEXT_MCP_URL is not a valid URL.");
  process.exit(2);
}

if (
  endpoint.protocol !== "https:" ||
  endpoint.hostname !== "api.sanity.io" ||
  !/^\/v1\/context\/organizations\/[^/]+\/mcp\/[^/]+\/?$/.test(endpoint.pathname)
) {
  console.error("SANITY_CONTEXT_MCP_URL must be the real Sanity Context endpoint URL from the Context app.");
  process.exit(2);
}

let nextId = 1;

function parseResponse(body, contentType, expectedId) {
  if (contentType.includes("application/json")) {
    return JSON.parse(body);
  }

  if (contentType.includes("text/event-stream")) {
    const messages = body
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return messages.find((message) => message.id === expectedId) ?? messages.at(-1);
  }

  throw new Error("Sanity Context returned an unsupported response content type.");
}

async function rpc(method, params) {
  const id = nextId++;
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${organizationToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }),
      });
      break;
    } catch (error) {
      if (attempt === 2) {
        throw new Error(`${method}: network request failed after 3 attempts`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  if (!response.ok) {
    const safeBody = (await response.text()).replaceAll(organizationToken, "[redacted]").slice(0, 400);
    const reason = response.status === 401
      ? "authentication failed (401)"
      : response.status === 403
        ? "Context Viewer authorization failed (403)"
        : `HTTP ${response.status}`;
    throw new Error(`${method}: ${reason}${safeBody ? ` — ${safeBody}` : ""}`);
  }

  const payload = parseResponse(await response.text(), response.headers.get("content-type") ?? "", id);
  if (!payload || payload.id !== id) {
    throw new Error(`${method}: no matching JSON-RPC response was returned.`);
  }
  if (payload.error) {
    throw new Error(`${method}: Sanity Context returned JSON-RPC error ${payload.error.code}.`);
  }
  return payload.result;
}

async function callTool(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  if (result?.isError) {
    throw new Error(`Tool ${name} returned an error.`);
  }
  return result;
}

try {
  const listed = await rpc("tools/list");
  const tools = listed?.tools;
  if (!Array.isArray(tools)) {
    throw new Error("tools/list did not return a tools array.");
  }

  const names = new Set(tools.map((tool) => tool.name));
  console.log(`Connected to Sanity Context. Discovered tools: ${[...names].join(", ") || "(none)"}`);

  for (const required of ["initial_context", "schema_explorer", "groq_query"]) {
    if (!names.has(required)) {
      throw new Error(`Required GROQ-mode capability is missing: ${required}. Check the endpoint's dataset source and tool allowlist.`);
    }
  }

  await callTool("initial_context");
  console.log("initial_context: available and call succeeded");

  const schemaTypes = [
    "technology",
    "version",
    "requirement",
    "compatibilityRule",
    "breakingChange",
    "migration",
    "exception",
    "source",
  ];

  for (const type of schemaTypes) {
    const schema = await callTool("schema_explorer", { type });
    if (!JSON.stringify(schema).toLowerCase().includes(type.toLowerCase())) {
      throw new Error(`schema_explorer did not return the requested type: ${type}.`);
    }
    console.log(`schema_explorer: ${type} visible`);
  }

  const groq = '{ "projectId": sanity::projectId(), "dataset": sanity::dataset(), "documentCount": count(*), "documentTypes": array::unique(*[]._type) }';
  const queryResult = await callTool("groq_query", { query: groq });
  const textResult = queryResult?.content?.find((item) => item.type === "text")?.text;
  let data;
  try {
    data = queryResult?.structuredContent ?? JSON.parse(textResult ?? "{}").result;
  } catch {
    throw new Error("GROQ response was returned but could not be parsed as JSON.");
  }
  if (data?.projectId !== "gjy7dyq2" || data?.dataset !== "production") {
    throw new Error(`GROQ response did not confirm gjy7dyq2/production: ${JSON.stringify(data)}`);
  }

  console.log("groq_query: successful for project gjy7dyq2 / dataset production");
  console.log(`Dataset result: ${data.documentCount} documents; types: ${(data.documentTypes ?? []).join(", ") || "none"}`);

  const representativeQueries = [
    {
      name: "Next.js 16 runtime requirement → version → technology → sources",
      query: `*[_type == "requirement" && _id == "requirement-next16-node"][0]{_id, statement, versionRange, "subject": subject->{label, "technology": technology->name}, "requiredTechnology": requiredTechnology->name, "sources": sources[]->{title, url}}`,
    },
    {
      name: "Next.js 16 breaking change → migration → affected version and sources",
      query: `*[_type == "breakingChange" && _id == "breaking-next16-node18"][0]{_id, title, "affectedVersions": affectedVersions[]->{label, "technology": technology->name}, "migrations": migrations[]->{title, "requiredFor": requiredFor[]->title, "sources": sources[]->{title, url}}}`,
    },
    {
      name: "Next.js 16 framework floor → Node.js version → time-sensitive lifecycle source",
      query: `*[_type == "compatibilityRule" && _id == "compat-node20-eol-temporal"][0]{_id, title, outcome, condition, "appliesTo": appliesTo[]->{label, "technology": technology->name}, "dependsOn": dependsOn[]->{label, "technology": technology->name}, "sources": sources[]->{title, url}}`,
    },
  ];
  for (const item of representativeQueries) {
    const result = await callTool("groq_query", { query: item.query });
    const textResult = result?.content?.find((entry) => entry.type === "text")?.text;
    let rows;
    try {
      const parsed = result?.structuredContent ?? JSON.parse(textResult ?? "{}");
      rows = parsed?.result ?? parsed;
    } catch {
      throw new Error(`groq_query returned an unreadable result for ${item.name}.`);
    }
    if (!rows || (Array.isArray(rows) ? rows.length === 0 : Object.keys(rows).length === 0)) {
      throw new Error(`groq_query returned no joined documents for ${item.name}.`);
    }
    console.log(`${item.name}: ${JSON.stringify(rows)}`);
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : "unexpected error";
  const causeCode = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause
    ? ` (${String(error.cause.code)})`
    : "";
  console.error(`Sanity Context smoke test failed: ${detail}${causeCode}`);
  process.exitCode = 1;
}

import { createInvestigation, canonicalJson } from "./application/relia-service.mjs";

const usage = `Relia infrastructure CLI

  npm run relia -- investigate --technology Next.js --from 15 --to 16 [options]
  npm run relia -- demo

Options:
  --node <version>       Node.js version in the environment
  --react <version>      React version (also defaults React DOM to this version)
  --react-dom <version>  Explicit React DOM version
  --typescript <version> TypeScript version
  --router <name>        Router context (App or Pages)
  --scope <scope>        full-upgrade or compatibility-only
  --env key=value        Additional environment entry; repeatable
  --context key=value    Additional context entry; repeatable
  --requested-by <name>  Requester metadata
  --json                 Print the complete VerifiedDecisionArtifact
`;

function parseArgs(args) {
  const parsed = { positional: [], options: new Map(), env: {}, context: {} };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) { parsed.positional.push(token); continue; }
    const key = token.slice(2);
    if (["json", "help"].includes(key)) { parsed.options.set(key, true); continue; }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
    index += 1;
    if (key === "env" || key === "context") {
      const split = value.indexOf("=");
      if (split < 1) throw new Error(`${token} must use key=value.`);
      parsed[key][value.slice(0, split)] = value.slice(split + 1);
    } else parsed.options.set(key, value);
  }
  return parsed;
}

function contractFromOptions(parsed) {
  const options = parsed.options;
  const environment = { ...parsed.env };
  const context = { ...parsed.context };
  for (const key of ["node", "react", "react-dom", "typescript"]) if (options.has(key)) environment[key] = options.get(key);
  if (options.has("router")) context.router = options.get("router");
  const metadata = {};
  if (options.has("scope")) metadata.scope = options.get("scope");
  return {
    subject: { technology: options.get("technology") ?? "", from: options.get("from") ?? "", to: options.get("to") ?? "" },
    environment,
    context,
    ...(options.has("requested-by") ? { requestedBy: options.get("requested-by") } : {}),
    ...(Object.keys(metadata).length ? { metadata } : {}),
  };
}

function outputText(investigation) {
  const attack = investigation.attack;
  const lines = [
    `Decision: ${investigation.decision.status}`,
    ...investigation.decision.findings.slice(0, 4).map((finding) => `Finding: ${finding.summary}`),
    `Verification: ${attack.status}${attack.executed ? " (executed)" : " (not executed)"}`,
    `Investigation: ${investigation.id}`,
    `Fingerprint: ${investigation.fingerprint}`,
    `Proof: ${investigation.proof.trace.length} source-backed links; complete=${investigation.proof.complete}`,
    `Sources: ${investigation.provenance?.sources?.length ?? 0}`,
  ];
  return lines.join("\n");
}

async function investigateCommand(contract, jsonOutput) {
  const result = await createInvestigation(contract);
  if (jsonOutput) process.stdout.write(`${canonicalJson(result.artifact ?? result.investigation)}\n`);
  else process.stdout.write(`${outputText(result.investigation)}\n`);
  if (result.investigation.status === "FAILED") process.exitCode = 1;
}

async function demoCommand() {
  const cases = [
    { name: "CASE A · Next.js 15 → 16, Node 20.8", contract: { subject: { technology: "nextjs", from: "15", to: "16" }, environment: { node: "20.8", react: "19", typescript: "5.1" }, context: { router: "app" }, requestedBy: "demo" } },
    { name: "CASE B · Next.js 15.1, React 19, Pages Router", contract: { subject: { technology: "nextjs", from: "15", to: "15.1" }, environment: { node: "22", react: "19", typescript: "5.1" }, context: { router: "pages" }, metadata: { scope: "compatibility-only" }, requestedBy: "demo" } },
    { name: "CASE C · Next.js 14 → 15, router unknown", contract: { subject: { technology: "nextjs", from: "14", to: "15" }, environment: { node: "18.18", react: "18", typescript: "5.0" }, context: {}, metadata: { scope: "compatibility-only" }, requestedBy: "demo" } },
  ];
  for (const item of cases) {
    const result = await createInvestigation(item.contract);
    const { investigation, artifact } = result;
    process.stdout.write(`\n${item.name}\nChangeContract: ${canonicalJson(investigation.contract)}\nProvisional: ${investigation.decision.initial}\nRed Team: ${investigation.attack.status} (${investigation.attack.executed ? "executed" : "failed"})\nFinal: ${investigation.decision.status}\nProof: ${investigation.proof.trace.length} links; complete=${investigation.proof.complete}\nFingerprint: ${investigation.fingerprint}\n`);
    if (!artifact) process.stdout.write(`Artifact: not issued (${investigation.status})\n`);
  }
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  const [command] = parsed.positional;
  if (parsed.options.get("help") || !command) process.stdout.write(usage);
  else if (command === "investigate") await investigateCommand(contractFromOptions(parsed), Boolean(parsed.options.get("json")));
  else if (command === "demo") await demoCommand();
  else throw new Error(`Unknown command: ${command}\n\n${usage}`);
} catch (error) {
  process.stderr.write(`${error.name ?? "Error"}: ${error.message}${error.details?.length ? `\n${error.details.join("\n")}` : ""}\n`);
  process.exitCode = 2;
}

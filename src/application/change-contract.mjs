import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";

const root = process.cwd();
const schemaPromise = readFile(path.join(root, "schemas", "change-contract.schema.json"), "utf8").then(JSON.parse);
let validatorPromise;

export class ContractValidationError extends Error {
  constructor(message, details = []) { super(message); this.name = "ContractValidationError"; this.details = details; }
}

export async function validateChangeContract(contract) {
  const schema = await schemaPromise;
  validatorPromise ??= Promise.resolve(new Ajv({ allErrors: true, strict: false }).compile(schema));
  const validate = await validatorPromise;
  if (!validate(contract)) throw new ContractValidationError("Invalid ChangeContract.", (validate.errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message}`));
  for (const key of ["technology", "from", "to"]) if (!contract.subject[key].trim()) throw new ContractValidationError(`subject.${key} must not be empty.`);
  if (contract.subject.from.trim() === contract.subject.to.trim()) throw new ContractValidationError("The current and proposed versions must differ.", ["subject.from and subject.to are identical."]);
  if (contract.requestedBy !== undefined && !contract.requestedBy.trim()) throw new ContractValidationError("requestedBy must not be empty when supplied.");
  return normalizeContract(contract);
}

export function normalizeContract(contract) {
  const normalizeJson = (value) => {
    if (Array.isArray(value)) return value.map(normalizeJson);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeJson(value[key])]));
    return typeof value === "string" ? value.trim() : value;
  };
  const clean = normalizeJson(contract);
  clean.subject.technology = clean.subject.technology.trim();
  clean.subject.from = clean.subject.from.trim();
  clean.subject.to = clean.subject.to.trim();
  if (clean.requestedBy) clean.requestedBy = clean.requestedBy.trim();
  return clean;
}

export function canonicalizeChangeContract(contract) {
  return JSON.stringify(normalizeContract(contract));
}

export function toReasoningInput(contract, graph) {
  const technology = graph.resolveTechnology(contract.subject.technology);
  const stack = {};
  for (const [key, value] of Object.entries(contract.environment ?? {})) {
    const normal = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normal === "react") {
      stack.React = String(value);
      if (!Object.keys(contract.environment).some((entry) => entry.toLowerCase().replace(/[^a-z0-9]/g, "") === "reactdom")) stack["React DOM"] = String(value);
    } else if (normal === "node" || normal === "nodejs") stack["Node.js"] = String(value);
    else if (normal === "router") stack.Router = String(value);
    else if (normal === "proxyruntime") stack["Proxy runtime"] = String(value);
    else if (normal === "middlewarepresent") stack["Middleware present"] = String(value);
    else {
      const dependency = graph.resolveTechnology(key);
      stack[dependency?.name ?? key] = String(value);
    }
  }
  for (const [key, value] of Object.entries(contract.context ?? {})) {
    const normal = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normal === "router") stack.Router = String(value);
    else if (normal === "proxyruntime") stack["Proxy runtime"] = String(value);
    else if (["middlewarepresent", "ppr", "nextjschannel"].includes(normal)) {
      const names = { middlewarepresent: "Middleware present", ppr: "ppr", nextjschannel: "Next.js channel" };
      stack[names[normal]] = String(value);
    }
  }
  if (technology) stack[technology.name] = contract.subject.from;
  const input = { currentStack: stack, proposedChanges: [{ technology: technology?.name ?? contract.subject.technology, from: contract.subject.from, to: contract.subject.to, ...(contract.metadata?.scope ? { scope: contract.metadata.scope } : {}) }] };
  const intent = contract.metadata?.questionIntent;
  if (typeof intent === "string") input.questionIntent = intent;
  return input;
}

const versionParts = (label) => {
  if (!/^\d+(?:\.\d+){0,2}$/.test(String(label))) return null;
  return String(label).split(".").map(Number);
};
const compareVersions = (left, right) => {
  const a = versionParts(left); const b = versionParts(right);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
};
const satisfies = (actual, expression) => {
  const match = /^(>=|>|=|<=|<)\s*(\d+(?:\.\d+){0,2})$/.exec(expression);
  if (!match) return null;
  const comparison = compareVersions(actual, match[2]);
  if (comparison === null) return null;
  return ({ ">=": comparison >= 0, ">": comparison > 0, "=": comparison === 0, "<=": comparison <= 0, "<": comparison < 0 })[match[1]];
};
const sourceIdsFor = (record) => record.sources ?? [];

export function investigate(repo, input) {
  const evidence = [];
  const relationships = [];
  const blockingFactors = [];
  const uncertainties = [];
  const steps = [];
  const stack = input?.stack ?? {};
  const proposal = input?.proposed_change ?? {};
  if (!proposal.technology || !proposal.to) {
    return { status: "UNRESOLVED", summary: "The proposed technology and target version are required.", evidence, relationships, blocking_factors: [], uncertainties: ["Incomplete proposed change."], proof_trace: { steps, conclusion: "UNRESOLVED" } };
  }
  const technology = repo.getTechnology(proposal.technology);
  const targetVersion = technology && repo.getVersion(proposal.to, technology._id);
  if (!technology || !targetVersion) {
    const message = `Could not resolve ${proposal.technology} ${proposal.to} to one dataset version.`;
    return { status: "UNRESOLVED", summary: message, evidence, relationships, blocking_factors: [], uncertainties: [message], proof_trace: { steps, conclusion: "UNRESOLVED" } };
  }

  const inputStackVersion = proposal.from ?? stack[technology.name];
  if (inputStackVersion) steps.push({ entity: `Current ${technology.name}`, relationship: "version", target: String(inputStackVersion), source: "user input" });
  steps.push({ entity: `${technology.name} ${targetVersion.label}`, relationship: "targetVersion", target: "proposed upgrade", source: "user input" });

  const addEvidence = (record, relationship, target) => {
    const sources = sourceIdsFor(record);
    if (!evidence.some((item) => item.id === record._id)) evidence.push({ id: record._id, type: record._type ?? "fact", statement: record.statement ?? record.effect, source_ids: sources, source_evidence: record.sourceEvidence });
    relationships.push({ from: record.subject ?? record.appliesTo?.[0] ?? record._id, relationship, to: target, record_id: record._id, source_ids: sources });
  };

  const requirements = repo.getRequirements({ subject: targetVersion._id });
  // Requirement records may be scoped to a major release. The label must match exactly or the scope remains unknown.
  for (const requirement of requirements) {
    const requiredTech = repo.getTechnology(requirement.requiredTechnology);
    const actual = requiredTech && stack[requiredTech.name];
    if (!actual) {
      uncertainties.push(`Stack version for ${requiredTech?.name ?? requirement.requiredTechnology} is missing.`);
      continue;
    }
    const check = satisfies(actual, requirement.versionRange);
    addEvidence(requirement, "requires", `${requiredTech.name} ${requirement.versionRange}`);
    steps.push({ entity: `${technology.name} ${targetVersion.label}`, relationship: "requires", target: `${requiredTech.name} ${requirement.versionRange}`, record_id: requirement._id, source_ids: requirement.sources });
    if (check === false) {
      const isReactFamily = ["tech-react", "tech-react-dom"].includes(requiredTech._id);
      const router = String(stack.Router ?? stack.router ?? "").toLowerCase();
      const pageException = repo.getExceptions().find((item) => item._id === "exception-next15-pages-react18" && item.appliesTo.includes(targetVersion._id));
      const react18 = compareVersions(actual, "19") === -1;
      const exceptionApplies = isReactFamily && router === "pages" && react18 && pageException;
      if (exceptionApplies) {
        addEvidence(pageException, "hasException", requiredTech.name);
        steps.push({ entity: `${technology.name} ${targetVersion.label}`, relationship: "exception", target: "Pages Router supports React 18", record_id: pageException._id, source_ids: pageException.sources });
      } else if (isReactFamily && !router && react18 && pageException) {
        addEvidence(pageException, "hasException", requiredTech.name);
        uncertainties.push(`Router type is missing; the documented React 18 exception applies only to Pages Router (${pageException._id}).`);
      } else {
        const reason = `${requiredTech.name} ${actual} does not satisfy ${requirement.versionRange} for ${technology.name} ${targetVersion.label}.`;
        blockingFactors.push({ record_id: requirement._id, message: reason, source_ids: requirement.sources });
        steps.push({ entity: `${requiredTech.name} ${actual}`, relationship: "failsRequirement", target: `${technology.name} ${targetVersion.label} requires ${requirement.versionRange}`, record_id: requirement._id, source_ids: requirement.sources });
      }
    } else if (check === null) uncertainties.push(`Cannot deterministically compare ${requiredTech.name} ${actual} to source range '${requirement.versionRange}'.`);
    else steps.push({ entity: `${requiredTech.name} ${actual}`, relationship: "satisfiesRequirement", target: requirement.versionRange, record_id: requirement._id, source_ids: requirement.sources });
  }

  const rules = repo.getCompatibilityRules().filter((rule) => rule.appliesTo.includes(targetVersion._id));
  for (const rule of rules) {
    addEvidence(rule, "hasCompatibilityRule", rule._id);
    const requiredVersions = rule.dependsOn.filter((id) => repo.getVersion(id));
    const matches = requiredVersions.every((id) => {
      const version = repo.getVersion(id);
      const tech = repo.getTechnology(version.technology);
      return stack[tech.name] === version.label;
    });
    const edgeProxyCondition = rule.condition?.toLowerCase().includes("proxy") && rule.condition?.toLowerCase().includes("edge runtime");
    const edgeProxyActive = String(stack["Proxy runtime"] ?? stack.proxy_runtime ?? "").toLowerCase() === "edge";
    if (rule.outcome === "incompatible" && matches && (!edgeProxyCondition || edgeProxyActive)) blockingFactors.push({ record_id: rule._id, message: rule.statement, source_ids: rule.sources });
    if (rule.outcome === "conditional") uncertainties.push(`Conditional compatibility rule ${rule._id} needs condition evaluation: ${rule.condition}`);
    if (rule.outcome === "incompatible" && edgeProxyCondition && !edgeProxyActive) uncertainties.push(`Potentially applicable rule ${rule._id} applies only if Proxy runtime is Edge; runtime was not declared.`);
    if (rule.outcome === "compatible" && !matches && rule.dependsOn.some((id) => repo.getVersion(id))) uncertainties.push(`Compatibility rule ${rule._id} is source-backed but its dependency versions do not match the declared stack.`);
  }

  const breakingChanges = repo.getBreakingChanges().filter((item) => item.affectedVersions.includes(targetVersion._id));
  for (const change of breakingChanges) {
    addEvidence(change, "affectedBy", change._id);
    const linkedMigrations = repo.getMigrations().filter((migration) => migration.requiredFor.includes(change._id));
    const completed = new Set(input.completed_migrations ?? []);
    const unverified = linkedMigrations.filter((migration) => !completed.has(migration._id));
    for (const migration of linkedMigrations) {
      addEvidence(migration, "migration", change._id);
      steps.push({ entity: change.title, relationship: "migration", target: migration.title, record_id: migration._id, source_ids: migration.sources });
    }
    if (unverified.length) uncertainties.push(`Potentially applicable breaking change '${change.title}' needs project-specific migration verification (${unverified.map((m) => m._id).join(", ")}).`);
  }

  for (const [name, declared] of Object.entries(stack)) {
    const tech = repo.getTechnology(name);
    if (!tech) continue;
    const v = repo.getVersion(String(declared), tech._id);
    if (v?.lifecycle === "end-of-life") {
      for (const source of v.sources.map((id) => repo.getSources().find((s) => s._id === id)).filter(Boolean)) {
        steps.push({ entity: `${tech.name} ${v.label}`, relationship: "lifecycle", target: "end-of-life as of retrieved source snapshot", record_id: v._id, source_ids: [source._id] });
      }
      uncertainties.push(`${tech.name} ${v.label} is marked end-of-life in the official source snapshot; this is an operational risk and does not by itself prove framework incompatibility.`);
    }
  }

  // The seed is intentionally bounded. A positive compatibility finding is not exhaustive proof of safety.
  uncertainties.push("This local seed has bounded source coverage and is not an exhaustive compatibility inventory.");

  let status = blockingFactors.length ? "BLOCKED" : "SAFE";
  if (!blockingFactors.length && (uncertainties.length || !requirements.length)) status = "UNRESOLVED";
  if (!blockingFactors.length && !uncertainties.length && breakingChanges.length === 0 && requirements.length > 0) status = "SAFE";
  const summary = status === "BLOCKED"
    ? blockingFactors[0].message
    : status === "SAFE"
      ? `The in-scope source-backed requirements for ${technology.name} ${targetVersion.label} are satisfied.`
      : `Available local evidence cannot establish full safety for ${technology.name} ${targetVersion.label}.`;
  return { status, summary, evidence, relationships, blocking_factors: blockingFactors, uncertainties, proof_trace: { steps, conclusion: status } };
}

/** Deterministic red-team pass over alternate, exceptional, conflicting, and temporal local evidence. */
export function attackDecision(repo, input, initial) {
  const checks = [];
  const target = repo.getTechnology(input?.proposed_change?.technology);
  const version = target && repo.getVersion(input.proposed_change.to, target._id);
  if (!version) return { initial_status: initial.status, red_team_findings: ["Target version could not be resolved for adversarial lookup."], final_status: "UNRESOLVED", additional_evidence: [] };
  const additions = [];
  let unresolvedAudit = false;
  for (const rule of repo.getCompatibilityRules({})) {
    if (!rule.appliesTo.includes(version._id)) continue;
    const found = { id: rule._id, outcome: rule.outcome, source_ids: rule.sources, statement: rule.statement, condition: rule.condition };
    additions.push(found);
    const edgeProxyCondition = rule.condition?.toLowerCase().includes("proxy") && rule.condition?.toLowerCase().includes("edge runtime");
    const edgeProxyActive = String(input.stack?.["Proxy runtime"] ?? input.stack?.proxy_runtime ?? "").toLowerCase() === "edge";
    if (rule.outcome === "incompatible" && (!edgeProxyCondition || edgeProxyActive)) checks.push(`Found source-backed incompatible rule ${rule._id}.`);
    if (rule.outcome === "incompatible" && edgeProxyCondition && !edgeProxyActive) checks.push(`Checked ${rule._id}; the relevant Proxy runtime was not supplied.`);
    if (rule.outcome === "conditional") {
      checks.push(`Checked conditional rule ${rule._id}; condition requires project-specific verification.`);
      unresolvedAudit = true;
    }
  }
  const requirements = repo.getRequirements({ subject: version._id });
  const exceptions = repo.getExceptions().filter((item) => item.appliesTo.includes(version._id));
  const grouped = new Map();
  for (const requirement of requirements) {
    const key = requirement.requiredTechnology;
    const prior = grouped.get(key);
    if (prior && prior.versionRange !== requirement.versionRange) checks.push(`Conflicting requirements found for ${key}; version scope must be resolved.`);
    else grouped.set(key, requirement);
    additions.push({ id: requirement._id, source_ids: requirement.sources, statement: requirement.statement, versionRange: requirement.versionRange });
    const tech = repo.getTechnology(requirement.requiredTechnology);
    const actual = tech && input.stack?.[tech.name];
    if (!actual) {
      checks.push(`Checked requirement ${requirement._id}; ${tech?.name ?? requirement.requiredTechnology} is missing from the supplied stack.`);
      unresolvedAudit = true;
    } else if (satisfies(actual, requirement.versionRange) === false) {
      const exceptionApplies = exceptions.some((item) => item._id === "exception-next15-pages-react18" && String(input.stack?.Router ?? input.stack?.router ?? "").toLowerCase() === "pages" && ["tech-react", "tech-react-dom"].includes(requirement.requiredTechnology) && compareVersions(actual, "19") === -1);
      if (!exceptionApplies) checks.push(`Rechecked ${requirement._id}: current ${tech.name} ${actual} fails ${requirement.versionRange}.`);
    }
  }
  for (const exception of exceptions) additions.push({ id: exception._id, source_ids: exception.sources, statement: exception.effect, condition: exception.condition });
  for (const change of repo.getBreakingChanges().filter((item) => item.affectedVersions.includes(version._id))) {
    additions.push({ id: change._id, source_ids: change.sources, statement: change.statement, migrations: change.migrations });
    for (const migration of repo.getMigrations().filter((item) => item.requiredFor.includes(change._id))) additions.push({ id: migration._id, source_ids: migration.sources, statement: migration.statement, steps: migration.steps });
  }
  const newer = repo.getCompatibilityRules().filter((item) => item.validFrom && item.appliesTo.includes(version._id));
  for (const record of newer) if (!additions.some((item) => item.id === record._id)) additions.push({ id: record._id, source_ids: record.sources, statement: record.statement, validFrom: record.validFrom });
  const blockingInRedTeam = additions.find((item) => item.outcome === "incompatible" && (!(item.condition?.toLowerCase().includes("proxy") && item.condition?.toLowerCase().includes("edge runtime")) || String(input.stack?.["Proxy runtime"] ?? input.stack?.proxy_runtime ?? "").toLowerCase() === "edge"));
  const contradictory = checks.some((line) => line.startsWith("Conflicting requirements"));
  const finalStatus = blockingInRedTeam ? "BLOCKED" : contradictory || (unresolvedAudit && initial.status === "SAFE") ? "UNRESOLVED" : initial.status;
  if (!checks.length) checks.push("No additional applicable blocking contradiction found in the local source-backed records.");
  return { initial_status: initial.status, red_team_findings: checks, final_status: finalStatus, additional_evidence: additions };
}

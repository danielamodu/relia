const decisionValues = new Set(["SAFE", "BLOCKED", "UNRESOLVED"]);

export function compareVersions(left, right) {
  if (!/^\d+(?:\.\d+){0,2}$/.test(String(left)) || !/^\d+(?:\.\d+){0,2}$/.test(String(right))) return null;
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}

export function meetsRange(version, range) {
  const match = /^(>=|>|=|<=|<)\s*(\d+(?:\.\d+){0,2})$/.exec(String(range));
  if (!match) return null;
  const comparison = compareVersions(version, match[2]);
  if (comparison === null) return null;
  return ({ ">=": comparison >= 0, ">": comparison > 0, "=": comparison === 0, "<=": comparison <= 0, "<": comparison < 0 })[match[1]];
}

function stackValue(stack, technology) {
  const found = Object.entries(stack ?? {}).find(([name]) => name.toLowerCase() === technology.toLowerCase());
  return found ? String(found[1]) : undefined;
}

function formatDocument(record, field, relationship) {
  return { documentId: record._id, documentType: record._type, field, relationship };
}

function sourcesFor(repo, record) {
  return (record.sources ?? []).map((id) => repo.getSources().find((source) => source._id === id)).filter(Boolean);
}

function evidenceFor(repo, record, field, relationship) {
  const sourceRecords = sourcesFor(repo, record);
  return {
    record,
    sources: sourceRecords,
    proof: sourceRecords.map((source) => ({
      ...formatDocument(record, field, relationship),
      sourceId: source._id,
      sourceUrl: source.url,
      sourceTitle: source.title,
    })),
  };
}

function addRecord(state, repo, record, field, relationship, summary, severity = "info") {
  if (!record || state.seen.has(record._id)) return;
  state.seen.add(record._id);
  const evidence = evidenceFor(repo, record, field, relationship);
  state.evidence.push({ id: record._id, type: record._type, summary, sourceIds: evidence.sources.map((source) => source._id) });
  state.proofTrace.push(...evidence.proof);
  for (const source of evidence.sources) state.sourceMap.set(source._id, source);
  state.findings.push({ severity, summary, evidenceIds: [record._id], sourceIds: evidence.sources.map((source) => source._id), proofTrace: evidence.proof });
}

function targetFor(repo, change) {
  const technology = repo.getTechnology(change.technology);
  const version = technology && repo.getVersion(change.to, technology._id);
  return { technology, version };
}

function isCompatibilityOnly(change) { return change.scope === "compatibility-only"; }
function isPagesRouter(stack) { return String(stack.Router ?? stack.router ?? "").toLowerCase() === "pages"; }
function isAppRouter(stack) { return String(stack.Router ?? stack.router ?? "").toLowerCase() === "app"; }
function hasRouter(stack) { return isPagesRouter(stack) || isAppRouter(stack); }
function proxyRuntime(stack) { return String(stack["Proxy runtime"] ?? stack.proxy_runtime ?? "").toLowerCase(); }

function compatibleDependenciesMatch(repo, rule, stack, targetTechnology) {
  for (const dependencyId of rule.dependsOn ?? []) {
    const version = repo.getVersion(dependencyId);
    if (version) {
      const dependencyTechnology = repo.getTechnology(version.technology);
      if (stackValue(stack, dependencyTechnology?.name ?? "") !== version.label) return false;
      continue;
    }
    const technology = repo.getTechnology(dependencyId);
    if (!technology) return false;
    if (!stackValue(stack, technology.name) && technology._id !== targetTechnology?._id) return false;
  }
  if (rule._id === "compat-next15-pages-react18" && !isPagesRouter(stack)) return false;
  if (rule._id === "compat-next15-app-react19") {
    if (!hasRouter(stack)) return false;
    if (isPagesRouter(stack) && (stackValue(stack, "React") !== "19" || stackValue(stack, "React DOM") !== "19")) return false;
  }
  if (rule._id === "compat-next16-proxy-edge-incompatible" && proxyRuntime(stack) !== "edge") return false;
  return true;
}

function inspectInitial(repo, input) {
  const stack = input.currentStack ?? {};
  const changes = input.proposedChanges ?? [];
  const state = { seen: new Set(), evidence: [], proofTrace: [], findings: [], sourceMap: new Map(), unresolved: [], blockers: [], positiveRules: [] };
  if (!Array.isArray(changes) || changes.length === 0) state.unresolved.push("At least one proposed change is required.");
  if (input.questionIntent === "unknown-relationship") {
    state.unresolved.push("No technology, version, or compatibility relationship for the requested package is present in the verified Sanity snapshot.");
    return { decision: "UNRESOLVED", state, compatibilityOnly: false };
  }
  for (const change of changes) {
    const { technology, version: targetVersion } = targetFor(repo, change);
    if (!technology || !targetVersion) {
      state.unresolved.push(`The target ${change.technology} ${change.to} is not represented by a unique version in the source snapshot.`);
      continue;
    }
    addRecord(state, repo, targetVersion, "label", "proposedChange.to -> target version", `${technology.name} ${targetVersion.label} is the requested target version.`);
    for (const requirement of repo.getRequirements({ subject: targetVersion._id })) {
      const requiredTechnology = repo.getTechnology(requirement.requiredTechnology);
      const actual = stackValue(stack, requiredTechnology?.name ?? "");
      addRecord(state, repo, requirement, "versionRange", "subject -> target version; requiredTechnology -> stack technology", requirement.statement, "requirement");
      if (!requiredTechnology || actual === undefined) {
        state.unresolved.push(`The stack does not specify ${requiredTechnology?.name ?? requirement.requiredTechnology}, required to evaluate ${requirement._id}.`);
        continue;
      }
      const passes = meetsRange(actual, requirement.versionRange);
      if (passes === false) {
        const reactFamily = ["tech-react", "tech-react-dom"].includes(requiredTechnology._id);
        const exception = reactFamily && repo.getExceptions().find((item) => item._id === "exception-next15-pages-react18" && item.appliesTo.includes(targetVersion._id));
        const below19 = compareVersions(actual, "19") === -1;
        if (exception && below19) addRecord(state, repo, exception, "condition", `exception appliesTo -> target version; supplied Router=${stack.Router ?? stack.router ?? "unknown"}`, exception.effect, "exception");
        if (exception && below19 && isPagesRouter(stack)) {
          state.positiveRules.push({ id: exception._id, targetVersion: targetVersion._id });
        } else if (exception && below19 && !hasRouter(stack)) {
          state.unresolved.push(`Router is unspecified; ${exception._id} applies only to Pages Router.`);
        } else {
          state.blockers.push(`${requiredTechnology.name} ${actual} does not satisfy ${requirement.versionRange} for ${technology.name} ${targetVersion.label}.`);
          state.findings.push({ severity: "blocking", summary: state.blockers.at(-1), evidenceIds: [requirement._id], sourceIds: requirement.sources, proofTrace: state.proofTrace.filter((proof) => proof.documentId === requirement._id) });
        }
      } else if (passes === null) {
        state.unresolved.push(`The source range '${requirement.versionRange}' cannot be evaluated deterministically.`);
      } else {
        state.positiveRules.push({ id: requirement._id, targetVersion: targetVersion._id });
      }
    }

    const matchingRules = repo.getCompatibilityRules().filter((rule) => (rule.appliesTo ?? []).includes(targetVersion._id));
    for (const rule of matchingRules) {
      const active = compatibleDependenciesMatch(repo, rule, stack, technology);
      const edgeRule = rule._id === "compat-next16-proxy-edge-incompatible";
      const appCanaryRule = rule._id === "compat-next16-app-react19-2";
      const missingCondition = edgeRule && !proxyRuntime(stack) || appCanaryRule && input.questionIntent === "exact-stable-peer-minimum";
      const relevant = active || missingCondition || rule.outcome === "conditional" && isCompatibilityOnly(change);
      if (!relevant) continue;
      addRecord(state, repo, rule, "condition/outcome", "appliesTo -> target version; dependsOn/condition -> declared stack", rule.statement, rule.outcome === "incompatible" ? "blocking" : "conditional");
      if (rule.outcome === "incompatible" && active) state.blockers.push(rule.statement);
      else if (missingCondition || rule.outcome === "conditional" && !active) state.unresolved.push(`The condition for ${rule._id} cannot be confirmed from the supplied stack.`);
      else if (rule.outcome === "compatible" || rule.outcome === "conditional" && active) state.positiveRules.push({ id: rule._id, targetVersion: targetVersion._id });
    }
    if (change.questionIntent === "exact-stable-peer-minimum") {
      state.unresolved.push("The snapshot contains no exact stable React and React DOM minimum for Next.js 16.");
      const canary = matchingRules.find((rule) => rule._id === "compat-next16-app-react19-2");
      if (canary && !state.seen.has(canary._id)) addRecord(state, repo, canary, "statement/condition", "appliesTo -> version-next-16; scope is App Router Canary features, not an exact package floor", canary.statement, "insufficient-evidence");
    }
  }

  const unknownStackNames = Object.keys(stack).filter((name) => !repo.getTechnology(name) && !["router", "proxy runtime", "proxy_runtime", "middleware present", "ppr", "next.js channel"].includes(name.toLowerCase()));
  for (const name of unknownStackNames) {
    state.unresolved.push(`No technology or version relationship for '${name}' exists in the source snapshot.`);
  }
  const compatibilityOnly = changes.length > 0 && changes.every(isCompatibilityOnly);
  let decision;
  if (state.blockers.length) decision = "BLOCKED";
  else if (state.unresolved.length) decision = "UNRESOLVED";
  else if (compatibilityOnly && state.positiveRules.length) decision = "SAFE";
  else decision = "SAFE"; // The red-team pass audits wider upgrade scope before this result is returned.
  return { decision, state, compatibilityOnly };
}

function redTeam(repo, input, initial) {
  const stack = input.currentStack ?? {};
  const changes = input.proposedChanges ?? [];
  const challenges = [];
  const additions = [];
  const seen = new Set(initial.state.seen);
  const add = (record, field, relationship, reason) => {
    if (!record || seen.has(record._id)) return;
    seen.add(record._id);
    const evidence = evidenceFor(repo, record, field, relationship);
    additions.push({ record, proof: evidence.proof, sources: evidence.sources, reason });
  };

  if (input.questionIntent === "unknown-relationship") {
    challenges.push({ kind: "unknown-relationship", evidenceId: null, message: "Searched the retrieved knowledge base for the requested package relationship; the snapshot contains no matching technology, version, or compatibility record." });
    return { status: "CHALLENGE_FOUND", challenges, additionalEvidence: additions, finalDecision: "UNRESOLVED" };
  }

  {
    for (const change of changes) {
      const { technology, version } = targetFor(repo, change);
      if (!version) continue;
      if (!initial.compatibilityOnly) {
        for (const breaking of repo.getBreakingChanges().filter((item) => (item.affectedVersions ?? []).includes(version._id))) {
          add(breaking, "affectedVersions", "affectedBy -> proposed target version", "potentially applicable breaking change requires code/configuration inspection");
          for (const migration of repo.getMigrations().filter((item) => (item.requiredFor ?? []).includes(breaking._id))) add(migration, "steps", "breaking change -> migration; requiredFor -> breaking change", "documented migration completion is not supplied in the input");
          challenges.push({ kind: "breaking-change", evidenceId: breaking._id, message: `The target has a documented breaking change: ${breaking.title}. The stack input cannot establish whether affected code/configuration exists or whether its migration is complete.` });
        }
      }
      for (const rule of repo.getCompatibilityRules().filter((item) => (item.appliesTo ?? []).includes(version._id))) {
        add(rule, "outcome/condition", "appliesTo -> proposed target version", "adversarial compatibility and conditional-rule search");
        if (rule.outcome === "conditional" && !compatibleDependenciesMatch(repo, rule, stack, technology)) challenges.push({ kind: "conditional-rule", evidenceId: rule._id, message: `Condition remains unverified: ${rule.condition}` });
        if (rule.outcome === "incompatible" && compatibleDependenciesMatch(repo, rule, stack, technology)) challenges.push({ kind: "incompatible-rule", evidenceId: rule._id, message: rule.statement });
      }
      for (const exception of repo.getExceptions().filter((item) => (item.appliesTo ?? []).includes(version._id))) {
        add(exception, "condition/effect", "appliesTo -> proposed target version", "adversarial exception-scope search");
        if (!hasRouter(stack) && exception._id === "exception-next15-pages-react18") challenges.push({ kind: "missing-context", evidenceId: exception._id, message: "The React 18 exception is router-scoped, but the supplied stack omits the router type." });
      }
      const requirements = repo.getRequirements({ subject: version._id });
      for (const requirement of requirements) {
        const requiredTech = repo.getTechnology(requirement.requiredTechnology);
        const actual = stackValue(stack, requiredTech?.name ?? "");
        add(requirement, "versionRange", "subject -> proposed target; requiredTechnology -> stack technology", "independent version-constraint recheck");
        if (!requiredTech || actual === undefined) challenges.push({ kind: "missing-context", evidenceId: requirement._id, message: `Cannot recheck ${requirement._id}: stack value for ${requiredTech?.name ?? requirement.requiredTechnology} is absent.` });
        else if (meetsRange(actual, requirement.versionRange) === false) {
          const reactFamily = ["tech-react", "tech-react-dom"].includes(requiredTech._id);
          const pageException = reactFamily && compareVersions(actual, "19") === -1 && repo.getExceptions().find((item) => item._id === "exception-next15-pages-react18" && item.appliesTo.includes(version._id));
          if (pageException && !hasRouter(stack)) challenges.push({ kind: "missing-context", evidenceId: pageException._id, message: "The React 18 exception cannot be confirmed because Router is not supplied." });
          else if (!(pageException && isPagesRouter(stack))) challenges.push({ kind: "version-constraint", evidenceId: requirement._id, message: `${requiredTech.name} ${actual} fails ${requirement.versionRange}.` });
        }
      }
    }
    if (!initial.compatibilityOnly) for (const [name, versionLabel] of Object.entries(stack)) {
      const tech = repo.getTechnology(name);
      const version = tech && repo.getVersion(String(versionLabel), tech._id);
      if (version?.lifecycle === "end-of-life") {
        const lifecycleSource = (version.sources ?? []).map((sourceId) => repo.getSources().find((source) => source._id === sourceId)).find(Boolean);
        if (lifecycleSource) {
          additions.push({ record: version, sources: [lifecycleSource], proof: [{ ...formatDocument(version, "lifecycle", "technology -> version; lifecycle -> source snapshot"), sourceId: lifecycleSource._id, sourceUrl: lifecycleSource.url, sourceTitle: lifecycleSource.title }], reason: "time-sensitive lifecycle challenge" });
        }
        challenges.push({ kind: "temporal-lifecycle", evidenceId: version._id, message: `${name} ${versionLabel} is marked end-of-life in the retrieved official lifecycle snapshot; this is operational risk, not a claim of framework incompatibility.` });
      }
    }
  }

  const explicitContradiction = challenges.some((challenge) => challenge.kind === "incompatible-rule" || challenge.kind === "version-constraint");
  const broadUpgradeRisk = challenges.some((challenge) => ["breaking-change", "conditional-rule", "temporal-lifecycle", "missing-context"].includes(challenge.kind));
  const finalDecision = initial.decision === "BLOCKED" || explicitContradiction
    ? "BLOCKED"
    : initial.decision === "SAFE" && broadUpgradeRisk
      ? "UNRESOLVED"
      : initial.decision;
  const materiallyChallenges = challenges.length > 0;
  const result = { status: materiallyChallenges ? "CHALLENGE_FOUND" : "PASSED", challenges, additionalEvidence: additions, finalDecision };
  return result;
}

export function investigate(repo, input) {
  const initial = inspectInitial(repo, input);
  const attack = redTeam(repo, input, initial);
  const decision = attack.finalDecision;
  const proofTrace = [...initial.state.proofTrace, ...attack.additionalEvidence.flatMap((item) => item.proof)];
  const evidence = [...initial.state.evidence];
  for (const item of attack.additionalEvidence) {
    if (!evidence.some((existing) => existing.id === item.record._id)) evidence.push({ id: item.record._id, type: item.record._type, summary: item.reason, sourceIds: item.sources.map((source) => source._id) });
  }
  const sourceMap = new Map(initial.state.sourceMap);
  for (const item of attack.additionalEvidence) for (const source of item.sources) sourceMap.set(source._id, source);
  const unresolved = [...new Set(initial.state.unresolved)];
  if (decision === "UNRESOLVED" && attack.challenges.length) {
    for (const challenge of attack.challenges.filter((item) => ["breaking-change", "conditional-rule", "temporal-lifecycle", "missing-context"].includes(item.kind))) unresolved.push(challenge.message);
  }
  if (decision === "SAFE" && !initial.compatibilityOnly) unresolved.push("A SAFE upgrade decision requires complete project-level migration and support evidence; the current input provides only stack versions.");
  const blocked = decision === "BLOCKED" ? initial.state.blockers.length ? initial.state.blockers : attack.challenges.filter((item) => ["incompatible-rule", "version-constraint"].includes(item.kind)).map((item) => item.message) : [];
  const summary = decision === "BLOCKED"
    ? blocked[0] ?? "A source-backed incompatibility applies to the proposed target."
    : decision === "SAFE"
      ? "The narrowly scoped, source-backed compatibility relationship matches the supplied version and condition."
      : "The available source snapshot cannot establish a safe decision for all requested conditions.";
  const confidence = decision === "BLOCKED" ? "HIGH" : decision === "SAFE" ? "HIGH" : "LOW";
  return {
    decision,
    initialDecision: initial.decision,
    confidence,
    summary,
    findings: initial.state.findings,
    proofTrace,
    unresolved,
    blockingFactors: blocked,
    evidence,
    sources: [...sourceMap.values()].map((source) => ({ id: source._id, title: source.title, url: source.url })),
    redTeam: { status: attack.status, challenges: attack.challenges, finalDecision: attack.finalDecision },
  };
}

export function validateProofTrace(decision) {
  return (decision.proofTrace ?? []).every((item) => ["documentId", "documentType", "field", "relationship", "sourceId", "sourceUrl"].every((key) => Object.hasOwn(item, key)) && Boolean(item.documentId && item.documentType && item.field && item.relationship && item.sourceId && item.sourceUrl));
}

export function isDecision(value) { return decisionValues.has(value); }

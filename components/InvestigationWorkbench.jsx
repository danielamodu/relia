"use client";

import { useState } from "react";
import { DecisionPanel } from "./DecisionPanel.jsx";
import ChallengeMode from "./ChallengeMode.jsx";
import InfrastructureDemo from "./InfrastructureDemo.jsx";

const scenarios = {
  "next16-node-floor": {
    label: "Next.js 16 · Node floor",
    currentStack: { "Next.js": "15", Router: "App", React: "19", "React DOM": "19", "Node.js": "20.8", TypeScript: "5.1" },
    to: "16", scope: "full-upgrade",
  },
  "next15-react19-pages": {
    label: "Next.js 15.1 · React 19 Pages",
    currentStack: { "Next.js": "15", Router: "Pages", React: "19", "React DOM": "19", "Node.js": "22", TypeScript: "5.1" },
    to: "15.1", scope: "compatibility-only",
  },
  "next16-proxy-edge": {
    label: "Next.js 16 · Proxy on Edge",
    currentStack: { "Next.js": "15", Router: "App", React: "19", "React DOM": "19", "Node.js": "22", TypeScript: "5.1", "Proxy runtime": "Edge", "Middleware present": "yes" },
    to: "16", scope: "full-upgrade",
  },
  "next15-router-unknown": {
    label: "Next.js 15 · Router unknown",
    currentStack: { "Next.js": "14", React: "18", "React DOM": "18", "Node.js": "18.18", TypeScript: "5.0" },
    to: "15", scope: "compatibility-only",
  },
};

function freshScenario(key) {
  const scenario = scenarios[key];
  return { currentStack: { ...scenario.currentStack }, to: scenario.to, scope: scenario.scope };
}

export default function InvestigationWorkbench() {
  const [scenarioId, setScenarioId] = useState("next16-node-floor");
  const [form, setForm] = useState(() => freshScenario("next16-node-floor"));
  const [investigation, setInvestigation] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proofOpen, setProofOpen] = useState(false);
  const [proofPayload, setProofPayload] = useState(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState("");
  const [attack, setAttack] = useState(null);
  const [attacking, setAttacking] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);

  function invalidate() { setInvestigation(null); setArtifact(null); setError(""); setAttack(null); setProofOpen(false); setProofPayload(null); setProofError(""); }
  function applyScenario(id) {
    setScenarioId(id); setForm(freshScenario(id)); invalidate();
  }
  function editStack(key, value) {
    setScenarioId("custom"); setForm((previous) => ({ ...previous, currentStack: { ...previous.currentStack, [key]: value } })); invalidate();
  }
  function editReact(value) {
    setScenarioId("custom"); setForm((previous) => ({ ...previous, currentStack: { ...previous.currentStack, React: value, "React DOM": value } })); invalidate();
  }

  function makeContract() {
    const currentStack = { ...form.currentStack };
    const router = currentStack.Router;
    delete currentStack.Router;
    const proxyRuntime = currentStack["Proxy runtime"];
    const middlewarePresent = currentStack["Middleware present"];
    delete currentStack["Proxy runtime"];
    delete currentStack["Middleware present"];
    const environment = { ...currentStack };
    const context = {};
    if (router && router !== "Unknown") context.router = router;
    if (proxyRuntime) context.proxyRuntime = proxyRuntime;
    if (middlewarePresent) context.middlewarePresent = middlewarePresent;
    const canonicalEnvironment = {};
    for (const [key, value] of Object.entries(environment)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      const canonicalKey = ({ nodejs: "node", react: "react", reactdom: "react-dom", typescript: "typescript" })[normalized] ?? key;
      canonicalEnvironment[canonicalKey] = value;
    }
    return {
      subject: { technology: "nextjs", from: currentStack["Next.js"], to: form.to },
      environment: canonicalEnvironment,
      context,
      requestedBy: "judge-ui",
      metadata: { scope: form.scope },
    };
  }

  async function investigate() {
    setBusy(true); setError(""); setAttack(null); setInvestigation(null); setArtifact(null); setProofOpen(false); setProofPayload(null);
    try {
      const response = await fetch("/api/v1/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(makeContract()) });
      const body = await response.json();
      if (body.investigation) { setInvestigation(body.investigation); setAttack(body.investigation.attack ?? null); }
      if (body.artifact) setArtifact(body.artifact);
      if (!response.ok) throw new Error(body.error?.message ?? body.investigation?.decision?.summary ?? "Investigation failed.");
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }

  async function attackDecision() {
    if (!investigation) return;
    setAttacking(true); setAttack(null);
    try {
      const response = await fetch(`/api/v1/investigations/${investigation.id}/attack`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Red-team investigation failed.");
      setInvestigation(body.investigation);
      setArtifact(body.artifact);
      setAttack(body.investigation.attack);
    } catch (problem) { setError(problem.message); }
    finally { setAttacking(false); }
  }

  async function toggleProof() {
    if (proofOpen) { setProofOpen(false); return; }
    if (!investigation) return;
    setProofOpen(true); setProofLoading(true); setProofError(""); setProofPayload(null);
    try {
      const response = await fetch(`/api/v1/investigations/${investigation.id}/proof`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Proof could not be retrieved.");
      setProofPayload(body);
    } catch (problem) { setProofError(problem.message); }
    finally { setProofLoading(false); }
  }

  return <main className="app-frame">
    <header className="masthead">
      <a className="brand" href="#top" aria-label="Relia home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>RELIA</span></a>
      <div className="masthead-caption"><span>Evidence-backed upgrade risk analysis</span><span className="masthead-status"><i /> STRUCTURED EVIDENCE</span></div>
      <button type="button" className="challenge-trigger" onClick={() => setChallengeOpen(true)}><span className="challenge-trigger-glyph" aria-hidden="true">↗</span> CHALLENGE RELIA <span className="trigger-count">12</span></button>
    </header>

    <section className="intro" id="top">
      <div className="intro-copy"><p className="eyebrow"><span className="eyebrow-dot" /> SOFTWARE CHANGE VERIFICATION</p><h1>Know what your<br className="desktop-break" /> upgrade touches.</h1><p>Relia follows structured technical evidence, attacks its own decision, and returns reproducible proof for people and agents.</p></div>
      <div className="intro-side"><span className="intro-index">01 <i /> 03</span><p>REQUIREMENTS<br />RELATIONSHIPS<br />PROOF</p><span className="intro-side-rule" /></div>
    </section>

    <div className="workbench-heading"><div><span className="section-number">01</span><div><p className="eyebrow">UPGRADE INVESTIGATION</p><h2>Define the change</h2></div></div><span className="snapshot-chip"><i /> {investigation?.evidenceSnapshot?.retrieval?.includes("live per investigation") ? "LIVE · SANITY CONTEXT GROQ" : investigation ? "OFFLINE · SANITY SNAPSHOT" : "SANITY STRUCTURED EVIDENCE"}</span></div>

    <div className="workbench-grid">
      <section className="input-panel" aria-labelledby="stack-title">
        <div className="panel-topline"><div><p className="eyebrow">CURRENT STACK</p><h3 id="stack-title">What are you running?</h3></div><span className="panel-count">{Object.keys(form.currentStack).filter((key) => !["Proxy runtime", "Middleware present"].includes(key)).length} PARAMETERS</span></div>
        <div className="curated-row"><label htmlFor="scenario-select">CURATED SCENARIO</label><select id="scenario-select" value={scenarioId} onChange={(event) => applyScenario(event.target.value)}>
          {scenarioId === "custom" ? <option value="custom">Custom stack</option> : null}
          {Object.entries(scenarios).map(([id, scenario]) => <option value={id} key={id}>{scenario.label}</option>)}
        </select></div>
        <div className="stack-grid">
          <VersionSelect label="Next.js" value={form.currentStack["Next.js"]} options={["14", "15", "15.1"]} onChange={(value) => editStack("Next.js", value)} />
          <VersionSelect label="React" value={form.currentStack.React} options={["18", "19"]} onChange={editReact} />
          <VersionSelect label="React DOM" value={form.currentStack["React DOM"]} options={["18", "19"]} onChange={(value) => editStack("React DOM", value)} />
          <VersionSelect label="Node.js" value={form.currentStack["Node.js"]} options={["18.18", "20.8", "20.9", "22"]} onChange={(value) => editStack("Node.js", value)} />
          <VersionSelect label="TypeScript" value={form.currentStack.TypeScript} options={["5.0", "5.1", "5.8"]} onChange={(value) => editStack("TypeScript", value)} />
          <VersionSelect label="Router" value={form.currentStack.Router ?? "Unknown"} options={["App", "Pages", "Unknown"]} onChange={(value) => editStack("Router", value)} />
        </div>
        {form.currentStack["Proxy runtime"] ? <div className="context-row"><span>PROXY RUNTIME</span><b>{form.currentStack["Proxy runtime"]}</b><span>MIDDLEWARE</span><b>{form.currentStack["Middleware present"]}</b></div> : null}
        <div className="proposed-change">
          <div className="change-label"><span className="eyebrow">PROPOSED CHANGE</span><span className="change-guide">TARGET VERSION</span></div>
          <div className="change-flow"><span className="technology-lockup"><span className="next-mark" aria-hidden="true">N</span><b>Next.js</b></span><span className="from-version">{form.currentStack["Next.js"]}</span><span className="change-arrow" aria-hidden="true">→</span><label className="target-select"><span className="sr-only">Target Next.js version</span><select value={form.to} onChange={(event) => { setForm((previous) => ({ ...previous, to: event.target.value })); setScenarioId("custom"); invalidate(); }}><option value="16">16</option><option value="15.1">15.1</option><option value="15">15</option></select></label></div>
          <div className="scope-row"><span className="scope-line" /><label htmlFor="scope-select">INVESTIGATION SCOPE</label><select id="scope-select" value={form.scope} onChange={(event) => { setForm((previous) => ({ ...previous, scope: event.target.value })); setScenarioId("custom"); invalidate(); }}><option value="full-upgrade">Full upgrade risk</option><option value="compatibility-only">Compatibility relationship only</option></select></div>
        </div>
        <button type="button" className="investigate-button" onClick={investigate} disabled={busy}>
          <span>{busy ? "INVESTIGATING" : "INVESTIGATE UPGRADE"}</span><span className="button-arrow" aria-hidden="true">{busy ? <span className="mini-loader light" /> : "↗"}</span>
        </button>
        <p className="input-footnote"><span aria-hidden="true">⌁</span> Typed relationships · Source-linked proof · Missing evidence stays unresolved</p>
      </section>

      <DecisionPanel investigation={investigation} artifact={artifact} busy={busy} error={error} proofOpen={proofOpen} onToggleProof={toggleProof} onAttack={attackDecision} attack={attack} attacking={attacking} proofLoading={proofLoading} proofError={proofError} proofTrace={proofPayload?.proof?.trace} />
    </div>

    <InfrastructureDemo />

    <footer className="app-footer"><span>RELIA <i>·</i> UPGRADE RISK RESEARCH</span><span>STRUCTURED CONTENT <i>·</i> SANITY CONTEXT</span><button type="button" onClick={() => setChallengeOpen(true)}>PILOT BENCHMARK <span aria-hidden="true">↗</span></button></footer>
    <ChallengeMode open={challengeOpen} onClose={() => setChallengeOpen(false)} />
  </main>;
}

function VersionSelect({ label, value, options, onChange }) {
  return <label className="version-field"><span>{label}</span><select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><span className="field-chevron" aria-hidden="true">⌄</span></label>;
}

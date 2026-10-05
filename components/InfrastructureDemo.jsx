"use client";

import { useState } from "react";

const scenarios = [
  {
    id: "a",
    label: "CASE A",
    question: "Can I upgrade Next.js 15 → 16?",
    contract: {
      subject: { technology: "nextjs", from: "15", to: "16" },
      environment: { node: "20.8", react: "19", "react-dom": "19", typescript: "5.1" },
      context: { router: "app" },
      requestedBy: "infrastructure-demo",
      metadata: { scope: "full-upgrade" },
    },
  },
  {
    id: "b",
    label: "CASE B",
    question: "Can Next.js 15.1 use React 19 on Pages Router?",
    contract: {
      subject: { technology: "nextjs", from: "15", to: "15.1" },
      environment: { node: "22", react: "19", "react-dom": "19", typescript: "5.1" },
      context: { router: "pages" },
      requestedBy: "infrastructure-demo",
      metadata: { scope: "compatibility-only" },
    },
  },
  {
    id: "c",
    label: "CASE C",
    question: "Can Next.js 15.1 use React 19 when the router is unknown?",
    contract: {
      subject: { technology: "nextjs", from: "15", to: "15.1" },
      environment: { node: "22", react: "19", "react-dom": "19", typescript: "5.1" },
      context: {},
      requestedBy: "infrastructure-demo",
      metadata: { scope: "compatibility-only" },
    },
  },
];

export default function InfrastructureDemo() {
  const [selected, setSelected] = useState(scenarios[0]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showArtifact, setShowArtifact] = useState(false);

  async function runScenario() {
    setBusy(true);
    setError("");
    setResult(null);
    setShowArtifact(false);
    try {
      const response = await fetch("/api/v1/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selected.contract),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? body.investigation?.decision?.summary ?? "The investigation request failed.");
      setResult(body);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  const artifact = result?.artifact;
  const investigation = result?.investigation;
  const redTeam = artifact?.verification?.redTeam;
  const verified = Boolean(artifact && redTeam?.executed && redTeam.status !== "FAILED");
  const responseExcerpt = artifact ? {
    decision: artifact.decision,
    verified,
    fingerprint: artifact.fingerprint,
    proof: { complete: artifact.proof.complete, trace: artifact.proof.trace.length },
    verification: { redTeam: { status: redTeam.status, executed: redTeam.executed } },
    provenance: {
      evidenceSnapshot: artifact.provenance.evidenceSnapshot.id,
      sources: artifact.provenance.sources.length,
    },
  } : null;

  return <section className="infrastructure-section" aria-labelledby="infrastructure-title">
    <div className="infrastructure-heading">
      <div><p className="eyebrow">RELIA AS INFRASTRUCTURE</p><h2 id="infrastructure-title">A verification step an agent can call.</h2></div>
      <code>POST /api/v1/investigations</code>
    </div>
    <p className="infrastructure-lede">The judge UI is one client. An agent can submit a ChangeContract before changing a project and receive a verified, source-linked artifact.</p>

    <div className="demo-layers">
      <div className="demo-layer human-layer"><span>LAYER 1 · HUMAN</span><strong>{selected.question}</strong></div>
      <div className="demo-layer relia-layer"><span>LAYER 2 · RELIA</span>
        {artifact ? <><strong className={`layer-decision ${artifact.decision.toLowerCase()}`}>{artifact.decision}</strong><p>{investigation?.decision?.summary}</p></> : <strong>{busy ? "INVESTIGATING…" : "RUN A CASE TO SEE THE DECISION"}</strong>}
      </div>
      <div className="demo-layer machine-layer"><span>LAYER 3 · MACHINE</span><strong>VerifiedDecisionArtifact</strong><small>decision · proof · red team · provenance · fingerprint</small></div>
    </div>

    <div className="scenario-row" role="group" aria-label="Infrastructure demo cases">
      {scenarios.map((scenario) => <button type="button" key={scenario.id} className={selected.id === scenario.id ? "scenario-button selected" : "scenario-button"} onClick={() => { setSelected(scenario); setResult(null); setError(""); setShowArtifact(false); }} aria-pressed={selected.id === scenario.id}>
        <span>{scenario.label}</span><strong>{scenario.question}</strong>
      </button>)}
    </div>

    <div className="api-demo-grid">
      <section className="api-contract" aria-label="ChangeContract API request">
        <div className="api-panel-heading"><span>REQUEST · CHANGE CONTRACT</span><button type="button" className="button button-api-run" onClick={runScenario} disabled={busy}>{busy ? "RUNNING" : "RUN THROUGH API"}<span aria-hidden="true">↗</span></button></div>
        <pre>{JSON.stringify(selected.contract, null, 2)}</pre>
      </section>
      <section className="api-response" aria-label="Actual API response">
        <div className="api-panel-heading"><span>RESPONSE · LIVE LOCAL API</span><span className={artifact ? "api-state live" : "api-state"}>{artifact ? "RETURNED" : "AWAITING REQUEST"}</span></div>
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
        {responseExcerpt ? <>
          <pre>{JSON.stringify(responseExcerpt, null, 2)}</pre>
          <div className="api-response-meta"><span>ID <code>{investigation.id}</code></span><span>RED TEAM <b>{redTeam.status}</b></span><span>PROOF <b>{artifact.proof.complete ? "COMPLETE" : "INCOMPLETE"}</b></span></div>
          <button type="button" className="artifact-json-toggle" onClick={() => setShowArtifact((value) => !value)} aria-expanded={showArtifact}>{showArtifact ? "HIDE FULL ARTIFACT" : "VIEW FULL ARTIFACT JSON"}<span aria-hidden="true">{showArtifact ? "−" : "+"}</span></button>
          {showArtifact ? <pre className="full-artifact-json">{JSON.stringify(artifact, null, 2)}</pre> : null}
        </> : <p className="api-empty">Run a case to display the actual API response and artifact from this investigation.</p>}
      </section>
    </div>

    <details className="cli-parity"><summary>CLI · SAME APPLICATION SERVICE</summary><pre>npm run relia -- investigate --technology nextjs --from 15 --to 16 --node 20.8 --react 19 --router app --json</pre><p>The CLI and HTTP routes both call <code>createInvestigation()</code>. They validate and emit the same artifact schema; the UI above sends its contract to this HTTP endpoint.</p></details>

    <div className="why-relia">
      <p className="eyebrow">WHY RELIA?</p>
      <ol>
        <li><strong>RELATIONSHIPS</strong><span>Decisions follow structured relationships instead of matching isolated text.</span></li>
        <li><strong>ADVERSARIAL VERIFICATION</strong><span>Relia searches for evidence that could invalidate its decision.</span></li>
        <li><strong>REPRODUCIBLE PROOF</strong><span>Each verified decision carries provenance, evidence relationships, and a deterministic fingerprint.</span></li>
      </ol>
    </div>
  </section>;
}

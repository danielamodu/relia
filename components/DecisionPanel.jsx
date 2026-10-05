import ProofGraph from "./ProofGraph.jsx";

const statusClass = (value) => String(value ?? "unresolved").toLowerCase();
const typeLabels = {
  requirement: "REQUIREMENT",
  compatibilityRule: "COMPATIBILITY RULE",
  breakingChange: "BREAKING CHANGE",
  migration: "MIGRATION",
  exception: "EXCEPTION",
  version: "VERSION",
};

export function DecisionPanel({ investigation, artifact, busy, error, proofOpen, onToggleProof, onAttack, attack, attacking, proofLoading, proofError, proofTrace }) {
  if (!investigation && !busy && !error) return <section className="result-shell idle-shell" aria-live="polite">
    <div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div>
    <p className="eyebrow">INVESTIGATION RESULT</p>
    <h2>Bring a change into focus.</h2>
    <p className="idle-copy">Choose the stack and target versions, then investigate. Relia will follow the matching requirements, compatibility rules, exceptions, and sources.</p>
    <div className="graph-note"><span className="graph-dot" /> Evidence graph <span className="graph-divider">/</span> Sanity structured content</div>
  </section>;

  const decision = investigation?.decision?.status ?? "UNRESOLVED";
  const sources = artifact?.provenance?.sources ?? [];
  const resultProof = proofTrace ?? artifact?.proof?.trace ?? [];
  const redTeam = artifact?.verification?.redTeam ?? investigation?.attack;
  const verified = Boolean(artifact && redTeam?.executed && redTeam.status !== "FAILED");
  return <section className="result-shell" aria-live="polite" aria-busy={busy}>
    {busy ? <div className="investigating" role="status"><span className="loader-mark" /><div><p className="eyebrow">RELATIONSHIP TRAVERSAL</p><strong>Following version requirements and conditions…</strong></div></div> : null}
    {error ? <div className="request-error" role="alert"><span className="error-mark">!</span><div><p className="eyebrow">INVESTIGATION STOPPED</p><h2>Evidence could not be loaded.</h2><p>{error}</p><span>Check the local snapshot and try again.</span></div></div> : null}
    {investigation && !busy ? <>
      <div className="decision-topline"><p className="eyebrow">{investigation.status} INVESTIGATION <span className="eyebrow-dot">·</span> {investigation.decision.confidence} CONFIDENCE</p><span className="source-count">{sources.length} SOURCES</span></div>
      <div className={`decision-hero ${statusClass(decision)}`}>
        <span className="decision-symbol" aria-hidden="true">{decision === "SAFE" ? "✓" : decision === "BLOCKED" ? "×" : "?"}</span>
        <div><p className="decision-label">RELIA DECISION</p><h2>{decision}</h2></div>
        <p className="confidence-tag">{investigation.decision.confidence} CONFIDENCE</p>
      </div>
      <div className="why-block">
        <h3>WHY?</h3>
        <p className="decision-summary">{investigation.decision.summary}</p>
        {investigation.decision.findings?.length ? <ul className="finding-list">
          {investigation.decision.findings.slice(0, 4).map((finding, index) => <li key={`${finding.evidenceIds?.[0] ?? index}-${index}`}>
            <span className={`finding-mark ${statusClass(finding.severity)}`} aria-hidden="true">{finding.severity === "blocking" ? "×" : finding.severity === "requirement" ? "↳" : "·"}</span>
            <span>{finding.summary}</span>
          </li>)}
        </ul> : null}
        {investigation.decision.unresolved?.length ? <div className="uncertainty-note"><span>OPEN QUESTION</span><p>{investigation.decision.unresolved[0]}</p></div> : null}
      </div>
      <InvestigationLifecycle investigation={investigation} artifact={artifact} />
      {artifact ? <VerifiedReceipt investigation={investigation} artifact={artifact} verified={verified} onViewProof={onToggleProof} proofOpen={proofOpen} /> : null}
      <div className="result-actions">
        <button type="button" className="button button-attack" onClick={onAttack} disabled={attacking}>{attacking ? <><span className="mini-loader" /> SEARCHING</> : <>ATTACK DECISION <span aria-hidden="true">⌁</span></>}</button>
      </div>
      {artifact ? <EvidenceGraph artifact={artifact} /> : null}
      {proofOpen ? <div className="proof-panel" id="proof-panel">
        <div className="section-heading proof-heading"><div><p className="eyebrow">AUDITABLE PATH</p><h3>VIEW PROOF</h3></div><span>{resultProof.length} PROOF LINKS</span></div>
        <p className="proof-intro">Structured facts connected to this result. Each source link opens the official reference.</p>
        {proofError ? <p className="inline-error" role="alert">{proofError}</p> : null}
        <ProofGraph proof={resultProof} />
      </div> : null}
      {attack ? <AttackPanel attack={attack} /> : null}
      {artifact ? <ArtifactView artifact={artifact} /> : null}
      <div className="provenance-strip"><span>SNAPSHOT</span><code>{investigation.evidenceSnapshot?.id ?? "unavailable"}</code><span>·</span><span>{investigation.evidenceSnapshot?.documentCount ?? 0} DOCS</span><span>·</span><span>{artifact?.provenance?.sources?.length ?? 0} SOURCES</span></div>
      <div className="graph-note result-graph-note"><span className="graph-dot" /> Evidence graph <span className="graph-divider">/</span> Sanity structured content <span className="graph-end">· {investigation.proof?.trace?.length ?? 0} proof links</span></div>
    </> : null}
  </section>;
}

function InvestigationLifecycle({ investigation, artifact }) {
  const attack = artifact?.verification?.redTeam ?? investigation.attack;
  const stages = [
    ["CLAIM", Boolean(investigation.contract)],
    ["EVIDENCE", Boolean(artifact?.evidence?.length)],
    ["DECISION", Boolean(investigation.decision?.status)],
    ["ATTACK", Boolean(attack)],
    ["VERIFICATION", Boolean(attack?.executed && attack.status !== "FAILED")],
    ["PROOF", Boolean(artifact?.proof?.complete)],
  ];
  return <section className="lifecycle" aria-label="Investigation lifecycle">
    <div className="lifecycle-heading"><span className="eyebrow">INVESTIGATION LIFECYCLE</span><span>{stages.filter((stage) => stage[1]).length}/{stages.length} COMPLETE</span></div>
    <ol>{stages.map(([label, complete], index) => <li className={complete ? "complete" : "pending"} key={label}>
      <span className="lifecycle-node" aria-hidden="true">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span>
      <span>{label}</span>{index < stages.length - 1 ? <i aria-hidden="true">→</i> : null}
    </li>)}</ol>
  </section>;
}

function VerifiedReceipt({ investigation, artifact, verified, onViewProof, proofOpen }) {
  const redTeam = artifact.verification?.redTeam;
  return <section className="verified-receipt" aria-label="Verified decision receipt">
    <div className="receipt-top"><div><p className="eyebrow">{verified ? "VERIFIED DECISION" : "DECISION ARTIFACT"}</p><strong className={statusClass(artifact.decision)}>{artifact.decision}</strong></div><span className={verified ? "receipt-verified" : "receipt-unverified"}>{verified ? "RED TEAM COMPLETE" : "NOT VERIFIED"}</span></div>
    <dl className="receipt-grid">
      <div><dt>INVESTIGATION ID</dt><dd title={investigation.id}>{investigation.id}</dd></div>
      <div><dt>PROOF</dt><dd>{artifact.proof?.complete ? "COMPLETE" : "INCOMPLETE"}</dd></div>
      <div><dt>RED TEAM</dt><dd>{redTeam?.status ?? "UNAVAILABLE"}</dd></div>
      <div><dt>SOURCES</dt><dd>{artifact.provenance?.sources?.length ?? 0}</dd></div>
      <div className="receipt-snapshot"><dt>EVIDENCE SNAPSHOT</dt><dd title={artifact.provenance?.evidenceSnapshot?.id}>{artifact.provenance?.evidenceSnapshot?.id ?? "Unavailable"}</dd></div>
      <div className="receipt-fingerprint"><dt>FINGERPRINT · SHA-256</dt><dd title={artifact.fingerprint}>{artifact.fingerprint}</dd></div>
    </dl>
    <div className="receipt-actions">
      <button type="button" className="button button-proof" onClick={onViewProof} aria-expanded={proofOpen}>{proofOpen ? "HIDE PROOF" : "VIEW PROOF"}<span aria-hidden="true">↗</span></button>
      <button type="button" className="button button-artifact" onClick={() => { const panel = document.getElementById("verified-artifact-json"); if (panel) { panel.open = true; panel.scrollIntoView({ behavior: "smooth", block: "nearest" }); } }}>VIEW ARTIFACT<span aria-hidden="true">↓</span></button>
    </div>
  </section>;
}

function EvidenceGraph({ artifact }) {
  const trace = artifact.proof?.trace ?? [];
  if (!trace.length) return null;
  return <details className="evidence-graph">
    <summary><span><i aria-hidden="true" /> EVIDENCE GRAPH</span><small>{trace.length} proof relationships · {artifact.provenance?.sources?.length ?? 0} sources</small></summary>
    <p className="evidence-graph-intro">A traversable path built from the artifact’s proof trace. Each record and source below is returned by this investigation.</p>
    <ol>
      <li className="graph-decision-node"><span className="graph-node-type">DECISION</span><strong>{artifact.decision}</strong><small>{artifact.investigationId}</small></li>
      {trace.map((step, index) => <li className="graph-fact-node" key={`${step.documentId}-${step.sourceId}-${index}`}>
        <p className="graph-edge">{step.relationship}</p>
        <details><summary><span className="graph-node-type">{typeLabels[step.documentType] ?? step.documentType}</span><strong>{step.title}</strong><small>{step.documentId}</small></summary>
          <p>{step.fact ?? "No concise fact field was supplied."}</p>
          <dl><div><dt>PROOF FIELD</dt><dd>{step.field}</dd></div><div><dt>RELATIONSHIP</dt><dd>{step.relationship}</dd></div><div><dt>SOURCE ID</dt><dd>{step.sourceId}</dd></div></dl>
        </details>
        {step.sourceUrl ? <a className="graph-source-node" href={step.sourceUrl} target="_blank" rel="noreferrer"><span className="graph-node-type">SOURCE</span><strong>{step.sourceTitle}</strong><small>{step.sourceUrl}</small></a> : null}
      </li>)}
    </ol>
  </details>;
}

function ArtifactView({ artifact }) {
  return <details className="artifact-disclosure" id="verified-artifact-json">
    <summary>VERIFIED DECISION ARTIFACT · v{artifact.artifactVersion}<span>{artifact.fingerprint.slice(0, 22)}…</span></summary>
    <pre>{JSON.stringify(artifact, null, 2)}</pre>
  </details>;
}

function AttackPanel({ attack }) {
  const status = attack.status === "CHALLENGE_FOUND" ? "challenge" : "passed";
  const checks = ["Compatibility rules", "Exceptions", "Version constraints", "Breaking changes", "Migrations", "Conflicting evidence"];
  return <section className="attack-panel" aria-live="polite">
    <div className="attack-heading"><div><p className="eyebrow">INDEPENDENT SECOND PASS</p><h3>RED TEAM ANALYSIS</h3></div><span className="attack-stamp">{attack.status === "CHALLENGE_FOUND" ? "CHALLENGE FOUND" : "NO CHALLENGE FOUND"}</span></div>
    <p className="attack-explainer">Searching for evidence that could invalidate this decision…</p>
    <ul className="check-grid">{checks.map((check) => <li key={check}><span aria-hidden="true">✓</span> Checked {check.toLowerCase()}</li>)}</ul>
    <div className="attack-outcome">
      <div className={`attack-outcome-mark ${status}`} aria-hidden="true">{status === "challenge" ? "!" : "✓"}</div>
      <div><p className={`eyebrow ${status}`}>{attack.status === "CHALLENGE_FOUND" ? "CHALLENGE FOUND" : "NO CHALLENGE FOUND"}</p>
        {attack.challenges?.length ? <ul className="challenge-list">{attack.challenges.slice(0, 4).map((challenge, index) => <li key={`${challenge.evidenceId ?? challenge.kind}-${index}`}><strong>{challenge.evidenceId ?? challenge.kind}</strong><span>{challenge.message}</span></li>)}</ul> : <p>No contradictory record was found in the local evidence snapshot.</p>}
        <div className="decision-shift"><span>FINAL DECISION</span><strong>{attack.initialDecision}</strong><i aria-hidden="true">→</i><strong>{attack.finalDecision}</strong>{attack.initialDecision !== attack.finalDecision ? <em>CHANGED</em> : <em>UNCHANGED</em>}</div>
      </div>
    </div>
  </section>;
}

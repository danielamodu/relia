import { useEffect, useState } from "react";
import ProofGraph from "./ProofGraph.jsx";

function percent(value) { return `${(value * 100).toFixed(1)}%`; }

export default function ChallengeMode({ open, onClose }) {
  const [payload, setPayload] = useState(null);
  const [selected, setSelected] = useState("");
  const [caseResult, setCaseResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || payload) return;
    fetch("/api/challenge").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not load the pilot cases.");
      setPayload(body);
      setSelected(body.cases?.[0]?.id ?? "");
    }).catch((problem) => setError(problem.message));
  }, [open, payload]);

  async function runCase() {
    setBusy(true); setError(""); setCaseResult(null);
    try {
      if (!activeCase) throw new Error("Select a reviewed pilot case first.");
      const input = activeCase.input;
      const currentStack = input.currentStack ?? {};
      const environment = {};
      const context = {};
      const contextNames = new Set(["router", "proxy runtime", "proxy_runtime", "middleware present", "ppr", "next.js channel"]);
      for (const [key, value] of Object.entries(currentStack)) {
        if (contextNames.has(key.toLowerCase())) context[{ "proxy runtime": "proxyRuntime", proxy_runtime: "proxyRuntime", "middleware present": "middlewarePresent", "next.js channel": "nextjsChannel", router: "router", ppr: "ppr" }[key.toLowerCase()]] = value;
        else {
          const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          environment[{ nodejs: "node", react: "react", reactdom: "react-dom", typescript: "typescript" }[normalized] ?? key] = value;
        }
      }
      const change = input.proposedChanges?.[0] ?? {};
      const contract = {
        subject: { technology: change.technology.toLowerCase().replace(/[^a-z0-9]/g, ""), from: change.from, to: change.to },
        environment,
        context,
        requestedBy: "judge-ui",
        ...(change.scope || input.questionIntent ? { metadata: { ...(change.scope ? { scope: change.scope } : {}), ...(input.questionIntent ? { questionIntent: input.questionIntent } : {}) } } : {}),
      };
      const response = await fetch("/api/v1/investigations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(contract) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? body.investigation?.decision?.summary ?? "The reviewed case could not run.");
      setCaseResult(body);
    } catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }

  if (!open) return null;
  const summary = payload?.summary;
  const activeCase = payload?.cases?.find((item) => item.id === selected);
  return <section className="challenge-overlay" role="dialog" aria-modal="true" aria-labelledby="challenge-title">
    <div className="challenge-drawer">
      <div className="challenge-top"><div><p className="eyebrow">SAME VERIFIED EVIDENCE SNAPSHOT</p><h2 id="challenge-title">Challenge Relia</h2></div><button type="button" className="icon-button" aria-label="Close Challenge Relia" onClick={onClose}>×</button></div>
      <p className="challenge-lede">A comparison on 12 reviewed pilot cases from the current source snapshot. These results are from a small reviewed pilot set and are not a general RAG benchmark.</p>
      <div className="pilot-label"><span className="pilot-point" /> RELIA PILOT BENCHMARK <b>{summary ? `${summary.caseCount} reviewed cases` : "Loading case set"}</b></div>
      {summary ? <div className="score-compare">
        <div className="score-row"><span>Keyword / Flat retrieval</span><strong>{percent(summary.flatAccuracy)}</strong><small>same sources · no relationship joins</small></div>
        <div className="score-row relia-score"><span>Relia</span><strong>{percent(summary.reliaAccuracy)}</strong><small>typed relationships · version scope · red team</small></div>
      </div> : <div className="score-skeleton" aria-label="Loading pilot results" />}
      <div className="challenge-select-wrap"><label htmlFor="challenge-case">REVIEWED PILOT CASE <span>{payload?.cases?.length ?? "—"} reviewed cases where Relia recovered the adjudicated answer</span></label>
        <select id="challenge-case" value={selected} onChange={(event) => { setSelected(event.target.value); setCaseResult(null); }} disabled={!payload?.cases?.length}>
          {(payload?.cases ?? []).map((item) => <option key={item.id} value={item.id}>{item.question}</option>)}
        </select>
      </div>
      {activeCase ? <div className="side-by-side"><div><span>FLAT</span><b className={`mini-decision ${activeCase.flatDecision.toLowerCase()}`}>{activeCase.flatDecision}</b></div><i aria-hidden="true">→</i><div><span>RELIA</span><b className={`mini-decision ${activeCase.reliaDecision.toLowerCase()}`}>{activeCase.reliaDecision}</b></div></div> : null}
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
      <button type="button" className="button button-run-case" onClick={runCase} disabled={!selected || busy}>{busy ? <><span className="mini-loader" /> FOLLOWING RELATIONSHIPS</> : <>FOLLOW THIS RELATIONSHIP <span aria-hidden="true">↗</span></>}</button>
      {caseResult ? <div className="challenge-proof">
        <div className="challenge-outcome"><span>REVIEWED ANSWER <b>{activeCase?.expectedDecision}</b></span><span>REPLAYED RELIA RESULT <b>{caseResult.artifact?.decision ?? caseResult.investigation?.decision.status}</b></span><span>RED TEAM <b>{caseResult.investigation?.attack.status}</b></span></div>
        <p>{activeCase?.question}</p>
        <ProofGraph proof={caseResult.artifact?.proof.trace ?? []} />
      </div> : null}
      <p className="challenge-footnote">Pilot metrics are generated by <code>npm run benchmark</code> from 12 reviewed cases. Results describe this case set only.</p>
    </div>
  </section>;
}

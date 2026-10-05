const typeLabels = {
  requirement: "REQUIREMENT",
  compatibilityRule: "COMPATIBILITY RULE",
  breakingChange: "BREAKING CHANGE",
  migration: "MIGRATION",
  exception: "EXCEPTION",
  version: "VERSION",
};

export default function ProofGraph({ proof = [] }) {
  if (!proof.length) return <p className="proof-empty">No source-backed relationship was returned for this decision. Relia leaves the result unresolved when evidence is missing.</p>;

  return <ol className="proof-list">
    {proof.map((step, index) => <li className="proof-step" key={`${step.documentId}-${step.field}-${step.sourceId}-${index}`}>
      <span className="proof-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div className="proof-content">
        <div className="proof-kind">{typeLabels[step.documentType] ?? step.documentType} <span>· {step.documentId}</span></div>
        <h4>{step.title}</h4>
        <p className="proof-relationship">{step.relationship}</p>
        {step.fact ? <p className="proof-fact">{step.fact}</p> : null}
        <div className="proof-source">
          <span className="source-kicker">SOURCE</span>
          <a href={step.sourceUrl} target="_blank" rel="noreferrer">{step.sourceTitle} <span aria-hidden="true">↗</span></a>
          <span className="source-publisher">{step.sourcePublisher} · {step.sourceId}</span>
        </div>
      </div>
    </li>)}
  </ol>;
}

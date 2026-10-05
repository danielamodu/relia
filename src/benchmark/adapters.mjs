import { investigate } from "../reasoning/engine.mjs";

export class BenchmarkAdapter {
  async run() { throw new Error("BenchmarkAdapter.run() is not implemented"); }
}

export class LocalReliaAdapter extends BenchmarkAdapter {
  async run(repository, input) { return investigate(repository, input); }
}

export function scoreEvidence(expectedIds, retrievedIds) {
  const expected = new Set(expectedIds);
  const retrieved = new Set(retrievedIds);
  const hits = [...expected].filter((id) => retrieved.has(id)).length;
  return {
    expectedCount: expected.size,
    retrievedCount: retrieved.size,
    relevantRetrieved: hits,
    precision: retrieved.size ? hits / retrieved.size : null,
    recall: expected.size ? hits / expected.size : null,
  };
}

export function scoreDecision(expected, actual) {
  const valid = new Set(["SAFE", "BLOCKED", "UNRESOLVED"]);
  if (!valid.has(actual)) return { available: false, correct: false, expected, actual };
  return { available: true, correct: expected === actual, expected, actual };
}

export function classificationMetrics(rows) {
  const labels = ["SAFE", "BLOCKED", "UNRESOLVED"];
  const accuracy = rows.length ? rows.filter((row) => row.correct).length / rows.length : null;
  const byDecision = Object.fromEntries(labels.map((label) => {
    const predicted = rows.filter((row) => row.actual === label);
    const truePositive = predicted.filter((row) => row.expected === label).length;
    return [label, { predicted: predicted.length, truePositive, precision: predicted.length ? truePositive / predicted.length : null }];
  }));
  return { caseCount: rows.length, correct: rows.filter((row) => row.correct).length, accuracy, byDecision };
}

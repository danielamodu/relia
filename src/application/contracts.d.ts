export type Decision = "SAFE" | "BLOCKED" | "UNRESOLVED";

export interface ChangeContract {
  subject: { technology: string; from: string; to: string };
  environment: Record<string, string | number | boolean>;
  context: Record<string, unknown>;
  requestedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface Investigation {
  id: string;
  fingerprint: `sha256:${string}`;
  contract: ChangeContract;
  canonicalContract: string;
  status: "COMPLETED" | "FAILED";
  startedAt: string;
  completedAt: string;
  evidenceSnapshot: Record<string, unknown>;
  decision: { status: Decision; initial: Decision; summary: string; confidence: string; findings: unknown[]; unresolved: string[]; blockingFactors: string[] };
  attack: { status: "PASSED" | "CHALLENGE_FOUND" | "FAILED"; executed: boolean; challenges: unknown[]; initialDecision: Decision | null; finalDecision: Decision };
  proof: { complete: boolean; trace: unknown[] };
  artifact: VerifiedDecisionArtifact | null;
}

export interface VerifiedDecisionArtifact {
  artifactVersion: "1";
  investigationId: string;
  fingerprint: `sha256:${string}`;
  decision: Decision;
  subject: ChangeContract["subject"];
  findings: unknown[];
  constraints: unknown[];
  evidence: unknown[];
  relationships: unknown[];
  proof: { complete: boolean; trace: unknown[] };
  verification: { redTeam: Investigation["attack"] };
  provenance: { evidenceSnapshot: Record<string, unknown>; sources: unknown[]; documents: unknown[]; relationships: unknown[]; canonicalContract: string; timestamp: string };
}

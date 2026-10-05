# Phase 1 source and fact collection plan

Collect a bounded, versioned slice around the example upgrade path: Next.js 15 to 16. Include the exact Next.js releases covered by the official upgrade/migration material and preserve release labels as published. Do not assume every patch version needs an independent record when the source states a range; record the stated scope and evidence.

## Required source records

For each source: title, canonical URL, publisher, source type, publication/release date when stated, access date, and a short authority/scope note. Prefer official Next.js, React, Node.js, and TypeScript documentation, release notes, and migration guides. Save a content snapshot or stable excerpt/hash for reproducible baseline runs where licensing and tooling allow; never treat a URL alone as proof of what it said during a run.

The local normalized facts also carry a short `sourceEvidence` excerpt/section locator. This field was added to the Sanity fact document shapes so that evidence can be inspected without relying on a URL alone.

## Required structured facts

1. Technology identities and official names for Next.js, React, React DOM, Node.js, and TypeScript.
2. Version records for the relevant Next.js 15 and 16 releases; the React and React DOM versions named by each relevant Next.js source; Node.js and TypeScript version boundaries named by those same sources. Attach lifecycle/release dates only when official evidence states them.
3. Every explicit framework requirement on React, React DOM, Node.js, and TypeScript, preserving the original range text, exact applicable Next.js version/scope, quoted or faithfully summarized statement, and source reference.
4. Any explicit compatibility or incompatibility rules among those versions, including conditions, platform/runtime qualifications, and exclusions. Do not infer a pairwise compatibility rule merely because the docs do not mention a conflict.
5. Breaking changes in the Next.js 15-to-16 path that can affect whether an upgrade is safe, each tied to affected version(s), consequences, and any documented migration.
6. Migration procedures and completion evidence needed to determine whether a known breaking change has been addressed.
7. Documented exceptions/conditions, including the precise version and condition to which each applies.
8. Dates or version boundaries needed to distinguish superseded guidance from rules still applicable to older targets.
9. Contradictory or apparently contradictory statements from authoritative sources, retained as separate claims with scope/date/provenance rather than silently reconciled.

## Benchmark readiness gate

Before assigning an expected label, verify that each case's intended evidence is present, applicable to the exact versions/conditions in the case, and sufficient for the expected conclusion. Record a reviewer and adjudication note. If no authoritative evidence establishes either compatibility or incompatibility, label the case UNRESOLVED. Reserve explicitly unsupported package/relationship cases as unknown controls; do not manufacture negative compatibility claims.

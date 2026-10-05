## Product Identity
- Relia is a developer tool that investigates whether a proposed software version change is supported by evidence.
- It should feel like a focused engineering instrument: calm, precise, inspectable.
- It is for developers and technical judges evaluating upgrade risk.
- First load should communicate that decisions can be SAFE, BLOCKED, or UNRESOLVED and that each decision can be inspected.

## Visual Language
- Aesthetic direction: light editorial developer tooling, with warm paper surfaces and precise technical labels.
- Reference principles: Increase presents dense technical details with restrained hierarchy and contextual status; Topology's editorial restraint supports an authoritative feel. Relia applies these through a narrow working column, persistent version context, and a highlighted relationship path instead of financial dashboards or trading effects.
- Typography: Newsreader for display emphasis, DM Sans for interface text, and IBM Plex Mono for versions, relationships, and record IDs.
- Color system: warm paper base, ink-blue text, quiet stone surfaces, warm brass accent, with distinct forest, vermilion, and amber decision colors.
- Motion grammar: short entrance for the primary workspace; state changes use a small color and position shift; evidence chain expands from the selected finding; reduced-motion preference removes transitions.
- Texture/material language: matte paper, fine ruled borders, restrained soft depth.

## Design Tokens
- Colors: page #F4F2EC; surface #FBFAF6; raised surface #FFFFFF; border #D9D8D0; text #1D2A2C; muted #697678; accent #A76532; success #2F6B4D; warning #95631C; danger #A74035.
- Typography: Newsreader display; DM Sans body; IBM Plex Mono technical labels.
- Type sizes: 12, 13, 15, 18, 24, 34, 48px; display leading 0.98, body leading 1.5.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Radius: 6px controls, 10px panels, 999px status tags.
- Shadows: one subtle, warm low-opacity lifted surface shadow; no glow effects.
- Motion: 100ms press, 180ms state, 360ms panel entrance; cubic-bezier(0.16, 1, 0.3, 1); honor reduced motion.

## Copy Voice
- Tone: direct, technical, and evidence-aware.
- Avoid hype, anthropomorphic AI claims, and claims stronger than the snapshot supports.

## User Flow
- The user selects a curated current stack and upgrade scenario, then investigates.
- The decision appears with concise findings and explicit uncertainty.
- VIEW PROOF opens the structured relationship path and cited source documents.
- ATTACK DECISION reveals the independent red-team findings and whether they changed the decision.
- Challenge Relia opens the reviewed pilot cases where relationship reasoning changed the result.

## Screen Inventory
- `/`: single judge workspace with stack selectors, proposed upgrade, decision, proof, red-team, and benchmark challenge mode. Build this screen only.
- `/api/investigate` and `/api/challenge`: application endpoints used by the workspace; not user-facing pages.

## Design Constraints
- Preserve the Phase 3 reasoning engine, benchmark labels, Sanity schema, and evidence snapshot.
- Decisions must be computed by the existing engine; React components must not duplicate reasoning.
- Use the offline Sanity snapshot so the judge flow does not depend on network access.
- Every displayed proof item must retain its document, field, relationship, and source provenance.
- Keep the interaction centered on one upgrade investigation; no chat, authentication, or dashboard sections.
- Support keyboard use, visible focus, reduced motion, and narrow screens without horizontal overflow.

## Prototype Variants Considered
- A light editorial report, a dark terminal-like tool, and a split-pane evidence inspector were considered.
- The selected direction combines a warm light workspace with a compact evidence inspector so the decision stays prominent while relationship structure remains visible.

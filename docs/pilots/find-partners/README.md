# find-partners (research-only pilot)

Purpose:
- Build a local partner/investor/job candidate discovery workflow for CoqPi without any outbound messaging or production routing.

Scope:
- INPUT: target profile (sector, geography, role, mandate, urgency), optional exclusions.
- OUTPUT: ranked shortlist with source references and confidence.

Non-goals:
- No automatic outreach.
- No CRM writeback.
- No production calls without explicit owner approval.

## Pilot constraints (hard)

- No direct API calls in production unless explicitly approved in project runbook.
- No secrets are required for the pilot’s dry-run mode.
- No schema without explicit fallback handling.
- All generated candidates remain local notes until manual confirmation.

## Minimal artifact schema

Each run should produce JSON like:

```json
{
  "provider": "open-source/listing|manual-curation|seed-list",
  "run_id": "uuid",
  "query": {
    "domain": "agri-commodities",
    "target_role": "investor|partner|employer",
    "region": "EU|US|global",
    "stage": "pre-seed|pilot|scale"
  },
  "results": [
    {
      "name": "Acme Ventures",
      "evidence": "https://example.org/source",
      "fit": 0.83,
      "why": "agri + structured programs + public partnership history",
      "risk": "low|medium|high",
      "contact_hint": "public page / application",
      "decision": "research-only"
    }
  ],
  "notes": "validation and quality checks",
  "owner_approval_needed": true,
  "approved_outreach": false
}
```

## Run checklist

- [ ] Capture query in task note (goal, persona, geography, urgency).
- [ ] Run one dry-run source gather.
- [ ] Normalize results to the schema above.
- [ ] Mark each entry with source + confidence.
- [ ] Save output to local notes only.
- [ ] Route through owner review before any outreach/production action.

## Why this fits CoqPi now

- CoqPi already has governance + receipt patterns and can reuse the same evidence-first discipline.
- The pilot gives measurable partner discovery without changing user call workflows.
- Future integration: only if this pilot reaches stable output consistency.

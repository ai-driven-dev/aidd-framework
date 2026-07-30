# Investigation

Bound research by decisive evidence, not elapsed time.

```mermaid
---
title: Spike investigation
---
flowchart TD
  Frame["Name decisive evidence, actionable condition, and blockers"]
  Attempt["Take cheapest decisive path"]
  Record["Record method, source, and result"]
  Check{"Unverified or unchallenged?"}
  Verify["Apply the selected capability"]
  Outcome{"Resolved, blocked, or cancelled?"}
  Path{"Viable evidence path?"}
  Bounds{"Next path within authorized bounds?"}
  Ask["Ask to extend bounds or stop"]
  Inconclusive["Return inconclusive"]
  Done["Return evidence and status"]

  Frame --> Attempt
  Attempt --> Record
  Record --> Check
  Check -- yes --> Verify
  Verify --> Record
  Check -- no --> Outcome
  Outcome -- yes --> Done
  Outcome -- no --> Path
  Path -- no --> Inconclusive
  Path -- yes --> Bounds
  Bounds -- yes --> Attempt
  Bounds -- no --> Ask
  Ask -- extend --> Frame
  Ask -- stop --> Inconclusive
```

- Change the hypothesis, input, or method before retrying.
- Ask whether to extend or stop before changing status when a viable path exceeds bounds.

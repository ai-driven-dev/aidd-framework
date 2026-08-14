# Ecosystem

```mermaid
flowchart LR
  Human([Human])
  Agent([Agent])
  App([App])
  Vcs["<vcs platform> · vcs.md"]
  Tracker["<tracker> · backlog.md"]
  Service["<runtime service> · integration.md"]
  Chat["<tool> · human only"]
  Bot["<autonomous tool>"]

  Agent -- cli --> Vcs
  Agent -- mcp --> Tracker
  App -- http --> Service
  Human -- web --> Chat

  Vcs -- "<trigger>" --> Tracker
  Bot -- "<trigger>" --> Vcs
```

<!--
Capture: every external tool, how each actor reaches it, and what moves between tools.
Skip: a build step, a live value, and any detail the named file already owns.
This file is written on every project, like every other always row.
Rebuild the graph from the scan, never keep this one.
An actor edge carries the access mode, a hand-off edge carries what moves between two distinct
tools, and a tool a memory file owns names that file after a middle dot.
The file is the heading and the graph. Nothing follows it, not a note, not a caption.
Remove this comment when filled.
-->

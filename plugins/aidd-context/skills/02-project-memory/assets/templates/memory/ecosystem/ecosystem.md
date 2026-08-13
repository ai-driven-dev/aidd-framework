# Ecosystem

```mermaid
flowchart LR
  Human([Human])
  Agent([Agent])
  App([App])
  Vcs["<vcs platform>"]
  Tracker["<tracker>"]
  Service["<runtime service>"]

  Human -- web --> Vcs
  Agent -- cli --> Vcs
  Human -- web --> Tracker
  Agent -- mcp --> Tracker
  App -- http --> Service

  Vcs -- "<hand-off>" --> Tracker

  click Vcs href "vcs.md"
  click Tracker href "backlog.md"
  click Service href "integration.md"
```

<!--
Capture: every external tool, how each actor reaches it, and what moves between tools.
Skip: a build step, a live value, and any detail a clicked file already owns.
Rebuild the graph from the scan, never keep this one.
The file is the heading and the graph. Nothing follows it, not a note, not a caption.
Remove this comment when filled.
-->

---
status: pending
---

<!-- Fill or omit these sections; never add, rename, or reorder one. -->

# Instruction: {title}

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
```

## User Journey

```mermaid
flowchart TD
  A[TODO]
```

## Test Scope

<!-- Required for every phase. Keep Setup, Happy path, any qualifying Edge cases, and any required Teardown in this one journey. -->

```mermaid
---
title: Test scope
---
journey
  %% Every task has exactly one actor: browser, api, cli, or system.
  section Setup
    %% Deterministic preconditions and fixtures. Its channel may differ.
    {prepare fixture} => {ready state}: 5: {channel}
  section Happy path
    %% Required. Every task states action => observable outcome. All tasks use the same channel.
    {action} => {observable expected outcome}: 5: {channel}
  %% Add one named section per edge case only when its trigger and expected outcome are known.
  section Edge case - {name}
    %% Every task names trigger => action => observable outcome. All tasks use the same channel.
    {trigger} => {action} => {observable expected outcome}: 1: {channel}
  %% Include only when a scenario changes state. Its channel may differ.
  section Teardown
    {cleanup or reset action} => {baseline restored}: 5: {channel}
```

## Wireframe

<!-- UI phase only. No UI => omit the section, don't invent one. -->

```txt
{the confirmed wireframe}
```

## Tasks to do

### `{number})` {name}

> {straight to point goal}

1. {ultra concise step}
   ...

## Test acceptance criteria

<!-- Each criterion is an observable behavior, not a command. -->

| Task | Acceptance criteria              |
| ---- | -------------------------------- |
| 1... | {observable behavior of the task} |

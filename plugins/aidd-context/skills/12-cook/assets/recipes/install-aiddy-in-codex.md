# Install AIDDy in Codex

Install AIDDy, the Agent Y mascot, as a local custom pet in the ChatGPT desktop app.

<!-- Sources checked: 2026-08-07. -->

## Steps to install and wake AIDDy

### 1) 🔗 Open the AIDDy installer

The immutable deep link opens the canonical 11-row AIDDy atlas with sprite version 2.

1. In the ChatGPT desktop app, click [Install AIDDy](codex://pets/install?name=AIDDy&imageUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fai-driven-dev%2Fframework%2F1a52770253628062e4e8cbcda1bd062452354c27%2Fassets%2Fpets%2Faiddy-spritesheet.webp&description=Agent%20Y%20for%20AI-Driven%20Development&spriteVersionNumber=2).

```text
codex://pets/install?name=AIDDy&imageUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fai-driven-dev%2Fframework%2F1a52770253628062e4e8cbcda1bd062452354c27%2Fassets%2Fpets%2Faiddy-spritesheet.webp&description=Agent%20Y%20for%20AI-Driven%20Development&spriteVersionNumber=2
```

### 2) 📦 Confirm the installation

The confirmation screen lets you verify the pet before writing it to local Codex storage.

1. Check the name, description, and sprite preview.
2. Approve the installation.

```text
Name: AIDDy
Description: Agent Y for AI-Driven Development
Sprite version: 2
```

The public pet reference documents installation but no removal command; use the current **Settings > Pets** removal control when available.

### 3) 🐾 Select AIDDy

Selecting the installed custom pet makes it active in the ChatGPT desktop app.

1. Open **Settings > Pets**, select **Refresh** if needed, then choose **AIDDy**.

```text
Settings > Pets > AIDDy
```

### 4) ▶️ Wake AIDDy

The `/pet` command wakes the selected companion so it can report task activity.

1. Enter `/pet` in a task.

```text
/pet
```

## Verify

- AIDDy appears in **Settings > Pets** as a custom pet.
- `/pet` shows AIDDy and its animation changes with task activity.
- The link uses only the supported [pet install parameters](https://learn.chatgpt.com/docs/reference/commands#pets), including `spriteVersionNumber=2`.
- The pinned atlas has SHA-256 `a97872f637a6711da4a88cbbb56f9038b2fcb4ce870e021c9d2355a3421ad5a4`.

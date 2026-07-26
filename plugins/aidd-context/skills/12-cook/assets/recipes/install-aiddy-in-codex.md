# Install AIDDy in Codex

Install AIDDy, the Agent Y mascot, as a local Codex pet.

- [Install AIDDy in Codex](#install-aiddy-in-codex)
  - [Why](#why)
  - [Steps to install and wake AIDDy](#steps-to-install-and-wake-aiddy)
    - [1) 🔗 Open the AIDDy installer](#1--open-the-aiddy-installer)
    - [2) 📦 Confirm the installation](#2--confirm-the-installation)
    - [3) 🐾 Wake AIDDy](#3--wake-aiddy)
  - [Verify](#verify)

## Why

**AIDDy** reflects Codex task activity with the AI-Driven Development mascot.

**Sprite version 2** ensures Codex reads the extended 11-row animation atlas correctly.

## Steps to install and wake AIDDy

### 1) 🔗 Open the AIDDy installer

The versioned deep link opens the Codex pet installer with the canonical AIDDy atlas.

1. Use a machine with the Codex desktop app and internet access.
2. Click [Install AIDDy](codex://pets/install?name=AIDDy&imageUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fai-driven-dev%2Fframework%2Fmain%2Fassets%2Fpets%2Faiddy-spritesheet.webp&description=Agent%20Y%20for%20AI-Driven%20Development&spriteVersionNumber=2).

```text
codex://pets/install?name=AIDDy&imageUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fai-driven-dev%2Fframework%2Fmain%2Fassets%2Fpets%2Faiddy-spritesheet.webp&description=Agent%20Y%20for%20AI-Driven%20Development&spriteVersionNumber=2
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

### 3) 🐾 Wake AIDDy

Selecting the custom pet makes it available as the animated task companion documented in [Codex pets](https://learn.chatgpt.com/docs/pets).

1. Open **Settings > Pets**.
2. Refresh custom pets if AIDDy is not visible yet.
3. Select **AIDDy**.
4. Enter `/pet` in a task.

```text
/pet
```

## Verify

- AIDDy appears in **Settings > Pets** as a custom pet.
- `/pet` shows AIDDy and its animation changes with task activity.
- The link uses only the supported [pet install parameters](https://learn.chatgpt.com/docs/reference/app-commands#pets), including `spriteVersionNumber=2`.

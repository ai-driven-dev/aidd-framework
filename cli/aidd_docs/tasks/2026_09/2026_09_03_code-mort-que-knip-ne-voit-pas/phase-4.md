---
status: done
---

# Phase 4 — L'exigence que personne ne vérifiait

## Le défaut, qui n'est pas de l'encombrement

`AiTool.requiredIdeIds` : déclaré une fois dans le contrat, affecté une fois par le profil
copilot — `requiredIdeIds: ["vscode"]` — et lu **nulle part**. Trois occurrences dans tout le
dépôt, aucun test.

Ce n'est pas un champ inutile de plus. C'est une exigence écrite que rien n'applique :
`aidd framework install --tool copilot` sur un projet sans vscode passe sans un mot. Une
promesse tacite qui ne tient pas est pire qu'une absence de promesse.

## L'arbitrage : appliquer ou retirer

La dépendance est réelle — copilot écrit dans `.vscode/mcp.json` et `.vscode/settings.json`.
La question était donc de savoir laquelle des deux issues est juste.

Mesuré : **la dépendance est déjà déclarée ailleurs, et cette déclaration-là fonctionne.**
`install-ide-tool-use-case.ts` propage les réglages d'un outil IA vers un IDE en filtrant sur
`c.requiresTool === ideId` — une déclaration portée par la **capacité**, pas par l'outil. Et le
profil copilot la porte bien : `requiresTool: "vscode"` sur sa capacité `settings`.

Copilot déclarait donc la même chose deux fois : une fois par outil, jamais lue, et une fois
par capacité, honorée. La granularité par capacité est aussi la bonne — c'est un réglage
précis qui a besoin de l'IDE, pas l'outil entier.

Retirée, donc. Non parce qu'elle était vide, mais parce qu'elle doublait une déclaration qui
marche.

## Test

Gates : tsc propre · lint 506 fichiers 0 warning · knip propre · 2051 tests / 206 fichiers ·
arch 51/51 · 9 cellules golden identiques · smoke 98/0, 22/22.

`requiresTool` reste, et c'est lui qui porte la règle. Un futur outil qui a besoin d'un IDE le
déclare sur la capacité concernée, où quelque chose le lira.

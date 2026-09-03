---
objective: "A regression particular to one build target fails a test, instead of waiting for someone to notice."
status: implemented
---

# Plan: Freeze the nine golden cells

## Why

The golden captures nine target/mode builds and compared exactly one of them — `claude` —
byte-for-byte against its stored baseline. The other eight were stored and never checked.

That is how a copilot-only regression shipped the same day: `claude`'s content rewrite is
the identity, so the one guarded cell was structurally incapable of catching a change in any
other profile's. A guard that cannot fail for eight of nine cases is a guard for one case.

## What freezing found immediately

Three of the eight were already stale, and none of the drift came from the work that
prompted this — each was verified against a binary built at this branch's base, which
produces the same output.

| Cell | Files | Cause |
| ---- | ----: | ----- |
| `codex` | 30 | Codex is the only target that re-serialises skill frontmatter (`stripCodexSkillFrontmatter`), and `serializeFrontmatter` quotes scalars. Its output stopped matching the source bytes the baseline had recorded |
| `copilot:flat` | 2 | The hooks format grew a `version` field and a flattened shape after the baseline was written |
| `codex:flat` | 1 | `.codex/config.toml` |

The stored file has had **one write in its life**, at the migration commit of 2026-07-22.
Every change to codex frontmatter, to the hooks format and to the codex config since then
went unrecorded, because nothing compared them.

## Decisions

| Decision | Why |
| -------- | --- |
| Freeze all nine, not a chosen subset | Any subset repeats the question of which target is allowed to regress unnoticed. The answer that needs no judgement is none |
| Re-baseline the three stale cells rather than treat them as failures | Each was verified to be what already ships; the baseline was wrong, the output was not. Freezing a wrong baseline would fail every run until someone re-baselined it in a hurry, which is worse than recording reality once with the reason |
| Update the values in place, key order preserved | A regenerated file rewrites 186 lines for 33 real changes and buries them |
| Every re-baseline carries its reason in the file's header | The next person to see a red run needs to know whether re-baselining is the answer or the reflex |

## Revue (2026-09-03)

Le candidat tient — première fois de la séquence qu'une relecture indépendante ne trouve pas de
défaut. Elle a en revanche trouvé un trou de preuve qui valait la peine d'être comblé, et quatre
points de rigueur.

**Trente des trente-trois empreintes re-baselinées n'étaient gardées que par le baseline que ce
commit venait d'écrire.** `copilot:flat` et `codex:flat` ont chacune une spécification unitaire
antérieure à la branche qui confirme la nouvelle valeur. `codex` n'en avait aucune :
`stripCodexSkillFrontmatter` n'était testé nulle part. Poser la valeur et la geler dans le même
geste ne prouve rien. Le commit présentait les trois comme également corroborées ; c'était faux.

Corrigé par une spécification du transformateur lui-même — et l'argument le plus fort est apparu
en l'écrivant : **deux skills de la release épinglée ont un frontmatter que `js-yaml` refuse**.

```
FAIL aidd-context/skills/03-context-generate/SKILL.md | bad indentation of a mapping entry (2:75)
FAIL aidd-async-dev/skills/02-run/SKILL.md            | bad indentation of a mapping entry (2:55)
```

Une `description` contenant `: ` non citée. Les quotes que codex ajoute ne sont pas cosmétiques,
elles réparent un fichier illisible. Le baseline enregistrait la source cassée ; la sortie
actuelle est meilleure que ce qu'il gardait. C'est maintenant un cas de test.

**Quatre autres points, tous corrigés :**

| Point | Ce qui a changé |
| ----- | --------------- |
| `codex:flat` était re-baselinée sans raison écrite | Sa cause et ses invariants sont dans l'en-tête, avec le test qui les tient |
| « un seul écrit dans sa vie » | Vrai depuis la migration seulement ; les passes antérieures existent sur des branches repliées dans l'instantané. Reformulé |
| L'assertion s'arrêtait à la première cellule fautive | Elle les collecte et les nomme toutes. Éprouvé : deux cellules corrompues, les deux nommées |
| « les neuf » ne voulait dire « toutes » que tant que les listes écrites à la main couvraient le registre | Un test compare les listes à `AI_TOOL_IDS` et l'ensemble des clés stockées à l'ensemble attendu. Éprouvé dans les deux sens : cible retirée d'une liste, outil absent des deux |

Le doublon de test signalé est parti avec ce dernier changement.


---
status: draft
---

# Spec: where measurement lives, decided rather than inherited

## What went wrong

A person turns measurement on. The run journal lands in `<repo>/aidd_docs/runs/`, and nothing adds it to their `.gitignore` — `aidd setup` writes one entry, `.aidd/cache/`, and that is all. The files show up in `git status`, a `git add .` takes them, and they reach the remote.

Those files say who worked on what and for how long, and name every file a session wrote. The code already treats them as private: `0700` on the directory, `0600` on the files, and an explicit `chmod` because `mkdirSync`'s mode only applies to a directory it creates. All of that care, and then they are committable.

Nothing fails and nothing warns. That is the failure this whole layer exists to remove, arriving through the door nobody watched.

## Why it happened

Two locations were chosen and never written down as a decision:

- the **run journal** is per repository, because it records repository-relative paths and task folders
- the **stored figures** are per user, under `AIDD_USER_CONFIG_DIR` or `~/.config/aidd`, because a session's consumption belongs to the person and their machine rather than to whichever checkout they were standing in

Both are right. Neither is stated anywhere a reader would find, so the consequences of the first — it is inside a git repository, therefore it must be ignored — were never drawn.

## The asymmetry, and why it stays

Scope is not a knob to expose uniformly.

The journal **is** a property of a repository. Letting it live elsewhere would create a file describing one repository from outside it, and the first question of anyone reading it would be which one.

The figures are different. The per-user default is right, and a real case exists against it: a team that wants them shared, a CI that wants its own per repository. That choice already exists as `AIDD_USER_CONFIG_DIR` — but an undocumented environment variable is not an offered choice, it is a workaround insiders know.

So the work is to state the decision, ignore what follows from it, and turn the existing override into something a person can find.

## Done when

- A project where measurement was turned on does not offer its run journal to a commit.
- A repository that already has journal files in its history is told, rather than silently left as it is.
- Where each thing is written, and why there rather than elsewhere, is stated where someone looks before asking.
- Choosing another location for the figures is a documented choice with a name, not an environment variable found by reading source.
- A test fails when turning measurement on leaves the journal committable.

## Not this

Moving anything. Both locations are correct and this changes neither.

Nor the second gap found beside it: nothing here has been run on Windows or Linux, and `~/.config/aidd` is not where a Windows user expects it. That needs machines this work does not have, and claiming it works would be the same sin in a different file.

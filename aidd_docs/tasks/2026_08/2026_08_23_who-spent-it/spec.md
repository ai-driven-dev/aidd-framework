---
status: draft
---

# Spec: measurement that can name a person, and does not by default

## What is missing

A report answers by period, by day, by project, by step, by model, by tool and by ticket. It cannot answer *who*, and nothing it stores could be made to — no record carries an identity of any kind, deliberately.

Teams ask two different questions and only one of them is about individuals:

- **How much did this team spend, and on what?** Needs figures aggregated across people, and no name at all.
- **Is someone stuck, or carrying too much?** Needs a name, and needs the person to have agreed to it.

Building the second by accident while building the first is the failure to avoid.

## Why this is not a grouping

`by_project` was a field carried one hop further. This is not that. Adding an identity means deciding what may be recorded about a person, where it goes, who can read it, and how they take it back. That decision is the work; the code is the small half.

The layer has one rule that already answers most of it: **an unknown is never a zero**. Its counterpart here is that an identity is never a default. A figure with nobody's name on it is complete. A figure with the wrong name on it is worse than no figure, and a figure with a name nobody agreed to give is worse still.

## What is decided here

**Anonymous by default.** Measurement records no identity unless someone turned that on for themselves. A team that never touches this setting still gets every figure it has today, aggregated, forever.

**Named on explicit opt-in, per person, revocable.** The person choosing is the person named. Not their lead, not the repository, not a CI variable — a choice made on their own machine, that they can withdraw, and that says plainly what it will attach their name to.

**A stable identity that is not a name.** What joins records across a person's tools and machines is an identifier they hold; a display name is a separate, later thing that only exists once they have asked for it. The two are different fields because they are different decisions.

**Withdrawal is real.** Turning it off stops new records carrying it and says what happens to the ones already written. Something a person cannot take back is not a choice they were offered.

## Done when

- A report can answer per person, and does so only for people who chose it.
- A default installation records no identity anywhere, proven by reading what it writes rather than by reading the setting.
- Opting in, and out, is one action each, and each says what it changes.
- Records written before an opt-in stay anonymous — a choice made today does not reach backwards.
- Where an identity is absent, the figure is still complete and reads as unattributed to a person, never as missing.
- Every claim above is proven by a real session, on more than one tool.
- Any dimension works as a filter and as an axis, and combining filters narrows by `and`.
- A filter matching nothing names itself, rather than reporting a total of zero.
- A breakdown under any combination of filters still sums to that combination's own total, exactly.

## The second half: a filter is not an axis

Naming a person is worth little if the only question you can ask is "everything, by person". Today a report takes a period, one optional task, and **one** axis. You cannot ask for a project over a week broken down by step, and once identity exists you will immediately want one person on one project.

An axis says how to *group*. A filter says what to *keep*. They are the same set of dimensions — day, project, step, model, tool, task, and now person — and every one of them should work as either.

What that buys, in the questions people actually ask:

- *what did this repository cost last month, by step* — project as filter, step as axis
- *what did I spend on that ticket* — person and task as filters, one total
- *which day did this project spike* — project as filter, day as axis
- *who worked on this ticket* — task as filter, person as axis

Two things this must not become. Filters compose by **and**, never by a query language — the moment it needs parentheses it has outgrown a report and become a database. And a filter that matches nothing says so, naming the filter that emptied it, rather than printing a total of zero: the same rule as everywhere else here, one dimension further along.

## Not this

Teams, organisations, or any hierarchy above a person. Those need a source of truth about who belongs where, which this layer does not have and should not invent. Aggregating what people chose to share is in scope; deciding who they are to each other is not.

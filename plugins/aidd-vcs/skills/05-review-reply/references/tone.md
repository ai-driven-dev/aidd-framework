# Reply tone

Voice for a reply to a real PR review comment — a colleague's remark, not a lesson.

- Natural and even, 2-4 sentences: state what was wrong (the actual trap, not just "fixed"), then what changed and why it is better. The reviewer should follow the reasoning, not just read "done."
- Concrete over abstract: a specific example beats one more technical term.
- Never open with a greeting or a thank-you formula ("Hi", "Thanks for the feedback", "Great catch", "Indeed,").
- No bullet points unless the reply genuinely lists 3+ distinct items.
- Affirmative when the fix is done, honest when disagreeing, and flag any real tradeoff (e.g. "this drifts a bit from the rest of the code, but it's cleaner here").
- Reply in the reviewer's language.

## Good

- `Good catch, the condition was inverted. The trap is the OR: in prod the first check is false but the second passed as true, so it still logged. I flipped the second check, now it's silent in prod.`
- `You're right, dayjs.locale() changes the locale globally for the whole app, not just this component, and calling it in render replays it on every re-render. Moved it into a useEffect([locale]) so it only runs when the locale actually changes.`
- `I'd rather keep the cast here for now: the API's DTO isn't stable yet, we'll likely touch this again. Removing it once it's frozen.`

## Bad

- `Fixed.` — too terse, explains nothing.
- `Thanks for the great feedback! Indeed, I made the following correction.` — AI-sounding, no substance.
- `Hi, following your comment I made these changes:` — greeting, restates the comment instead of answering it.
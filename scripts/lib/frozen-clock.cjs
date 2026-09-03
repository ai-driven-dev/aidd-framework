// Preloaded with `node --require` in front of the journal hook, nowhere else.
//
// `record.cjs`'s `nowIso()` reads the wall clock, so a three-day scenario run in one second
// would land every session in the same instant, collapse every interval, and drop every
// derived axis onto its unattributed row while staying green. The clock is the one input
// this harness supplies.
//
// `Date.now()` moves with the constructor: `record.cjs`'s ULID takes its prefix from it.
const frozen = process.env.AIDD_FROZEN_CLOCK;
if (frozen) {
  const at = new Date(frozen);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`AIDD_FROZEN_CLOCK is not an instant this can read: ${frozen}`);
  }
  const fixed = at.getTime();
  class FrozenDate extends Date {
    constructor(...args) {
      // Only the argument-less call asks the time; `new Date(x)` is a parse.
      super(...(args.length === 0 ? [fixed] : args));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FrozenDate;
}

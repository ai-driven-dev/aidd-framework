/** A version's own three numeric components plus its pre-release identifiers, if any —
 * build metadata is parsed and then discarded, since semver gives it no bearing on
 * precedence. */
interface ParsedSemver {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Empty for a release version. A non-empty list always orders below the same
   * release with none — semver.org's own precedence rule. */
  readonly prerelease: readonly string[];
}

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseSemver(v: string): ParsedSemver | undefined {
  const match = v.match(SEMVER_PATTERN);
  if (!match) return undefined;
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease === undefined ? [] : prerelease.split("."),
  };
}

/** Anchored end to end: a version carrying anything past its own three numeric
 * components (or an optional pre-release/build suffix) is not valid semver, not a
 * loosely-matched prefix of one. */
export function isSemver(s: string): boolean {
  return parseSemver(s) !== undefined;
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  // Two strings neither side can parse compare equal rather than throwing — a caller
  // gating a decision on `<= 0` must see "no drift decided here", never a crash.
  const zero: ParsedSemver = { major: 0, minor: 0, patch: 0, prerelease: [] };
  const pa = parseSemver(a) ?? zero;
  const pb = parseSemver(b) ?? zero;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** semver.org's own precedence rule: no pre-release outranks any pre-release; between
 * two, each dot-separated identifier compares numerically when both sides are
 * digits-only, lexically otherwise, and the shorter list loses a tie on a shared
 * prefix. */
function comparePrerelease(a: readonly string[], b: readonly string[]): -1 | 0 | 1 {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const cmp = comparePrereleaseIdentifier(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

const NUMERIC_IDENTIFIER = /^\d+$/;

function comparePrereleaseIdentifier(a: string, b: string): -1 | 0 | 1 {
  const aIsNumeric = NUMERIC_IDENTIFIER.test(a);
  const bIsNumeric = NUMERIC_IDENTIFIER.test(b);
  if (aIsNumeric && bIsNumeric) {
    const [an, bn] = [Number(a), Number(b)];
    return an === bn ? 0 : an < bn ? -1 : 1;
  }
  if (aIsNumeric !== bIsNumeric) return aIsNumeric ? -1 : 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

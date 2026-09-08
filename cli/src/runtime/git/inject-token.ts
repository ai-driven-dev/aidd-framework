interface HostMatcher {
  /** The forge's registered domain. Matched against the URL's own host, never its text. */
  host: string;
  authPrefix: string;
}

const HOST_MATCHERS: readonly HostMatcher[] = [
  { host: "github.com", authPrefix: "x-access-token:" },
  { host: "gitlab.com", authPrefix: "oauth2:" },
  { host: "bitbucket.org", authPrefix: "x-token-auth:" },
  { host: "dev.azure.com", authPrefix: ":" },
];

/**
 * The host a URL actually addresses, or `null` when the string is not a parseable URL.
 * Substring-matching the whole URL text answered a different question — `https://
 * evil.example/github.com/x` and `https://notgithub.com/x` both contain `github.com`,
 * and both would have been handed a GitHub-shaped credential.
 */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matcherFor(hostname: string): HostMatcher | undefined {
  return HOST_MATCHERS.find((m) => hostname === m.host || hostname.endsWith(`.${m.host}`));
}

export function injectTokenIntoUrl(url: string, token: string | undefined): string {
  if (!token || !url.startsWith("https://")) return url;
  const hostname = hostnameOf(url);
  if (hostname === null) return url;
  const matcher = matcherFor(hostname);
  const authPrefix = matcher?.authPrefix ?? "";
  return url.replace("https://", `https://${authPrefix}${token}@`);
}

/**
 * The same URL with any userinfo removed.
 *
 * A user may type their own credential into a source URL
 * (`https://user:token@host/repo.git`). That string then travels two ways it should not: into
 * the error a failed clone prints, and into the cache directory's name, where the secret is
 * written to disk and stays there. Strip it before either use; the clone still receives the
 * URL with its credential.
 */
export function withoutCredentials(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@]*@/, "$1");
}

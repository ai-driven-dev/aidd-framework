interface HostMatcher {
  match: (url: string) => boolean;
  authPrefix: string;
}

const HOST_MATCHERS: readonly HostMatcher[] = [
  { match: (u) => u.includes("github.com"), authPrefix: "x-access-token:" },
  { match: (u) => u.includes("gitlab.com"), authPrefix: "oauth2:" },
  { match: (u) => u.includes("bitbucket.org"), authPrefix: "x-token-auth:" },
  { match: (u) => u.includes("dev.azure.com"), authPrefix: ":" },
];

export function injectTokenIntoUrl(url: string, token: string | undefined): string {
  if (!token || !url.startsWith("https://")) return url;
  const matcher = HOST_MATCHERS.find((m) => m.match(url));
  if (matcher === undefined) {
    return url.replace("https://", `https://${token}@`);
  }
  return url.replace("https://", `https://${matcher.authPrefix}${token}@`);
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

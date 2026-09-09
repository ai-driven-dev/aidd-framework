export interface TokenResolver {
  resolve(): string | null;
}

export interface CliAuthProvider extends TokenResolver {
  verify(): Promise<string>;
}

export interface TokenAuthProvider {
  verifyToken(token: string): Promise<string>;
}

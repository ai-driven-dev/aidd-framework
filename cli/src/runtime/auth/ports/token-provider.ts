export interface TokenProvider {
  resolve(): Promise<string | null>;
}

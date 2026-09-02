import { NotAuthenticatedError } from "../../kernel/errors.js";
import type { TokenProvider } from "./ports/token-provider.js";

export class RequireAuthUseCase {
  constructor(private readonly authReader: TokenProvider) {}

  async execute(): Promise<void> {
    if ((await this.authReader.resolve()) === null) {
      throw new NotAuthenticatedError();
    }
  }
}

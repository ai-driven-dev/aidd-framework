import type { CLIOutput } from "../output.js";

const BANNER = `
   _    ___ ___  ___
  /_\\  |_ _|   \\|   \\
 / _ \\  | || |) | |) |
/_/ \\_\\|___|___/|___/

 AI-Driven Development CLI`;

export function printBanner(output: CLIOutput): void {
  output.print(BANNER);
}

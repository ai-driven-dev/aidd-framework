import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../../../src/contexts/tools/domain/ports/host-plugin-registry-reader.js";

/** A registry double whose answer is fixed at construction — never a real file, never a
 * real binary. Stands in for whichever host a doctor or telemetry test needs to ask. */
export class FakeHostPluginRegistryReader implements HostPluginRegistryReader {
  constructor(private readonly reading: HostPluginRegistryReading) {}

  async read(): Promise<HostPluginRegistryReading> {
    return this.reading;
  }
}

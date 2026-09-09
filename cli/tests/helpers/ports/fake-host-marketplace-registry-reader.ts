import type {
  HostMarketplaceRegistryReader,
  HostMarketplaceRegistryReading,
} from "../../../src/contexts/tools/domain/ports/host-marketplace-registry-reader.js";

/** Stand-in for a host's own marketplace registry: one fixed reading unless a caller queues
 * several, each `read()` consuming the next and the last repeating forever. */
export class FakeHostMarketplaceRegistryReader implements HostMarketplaceRegistryReader {
  private readonly queue: HostMarketplaceRegistryReading[];
  reads = 0;

  constructor(...readings: readonly HostMarketplaceRegistryReading[]) {
    if (readings.length === 0) {
      throw new Error("FakeHostMarketplaceRegistryReader needs at least one reading");
    }
    this.queue = [...readings];
  }

  async read(): Promise<HostMarketplaceRegistryReading> {
    this.reads += 1;
    return this.queue.length > 1
      ? (this.queue.shift() as HostMarketplaceRegistryReading)
      : this.queue[0];
  }
}

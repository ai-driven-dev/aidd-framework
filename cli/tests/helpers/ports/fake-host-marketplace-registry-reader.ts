import type {
  HostMarketplaceRegistryReader,
  HostMarketplaceRegistryReading,
} from "../../../src/contexts/tools/domain/ports/host-marketplace-registry-reader.js";

/**
 * Stand-in for a host's own marketplace registry. Returns one fixed reading unless a
 * caller queues several, in which case each `read()` call consumes the next one and the
 * last queued reading repeats forever — this is what lets a test prove a guard reads
 * the registry again *after* a prior step changed it (garde 2's own "double de lecteur
 * ordonné"), without every simpler caller here having to queue just one.
 */
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

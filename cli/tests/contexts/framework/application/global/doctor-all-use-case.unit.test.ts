import { describe, expect, it } from "vitest";
import { DoctorAllUseCase } from "../../../../../src/contexts/framework/application/global/doctor-all-use-case.js";
import { buildDoctorUseCase, buildUnitDeps } from "../../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

describe("DoctorAllUseCase", () => {
  it("is not healthy when every scope errored (no manifest found)", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const doctorUseCase = buildDoctorUseCase(deps);
    const useCase = new DoctorAllUseCase(doctorUseCase);

    const result = await useCase.execute(PROJECT_ROOT);

    expect(result.ai).toBeNull();
    expect(result.ide).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.healthy).toBe(false);
  });
});

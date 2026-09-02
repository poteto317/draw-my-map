import { createMonotonicIdGenerator } from "@/domain/nodes/nodeIdGenerator";

describe("createMonotonicIdGenerator", () => {
  it("returns the clock value for the first ID", () => {
    const generateId = createMonotonicIdGenerator(() => 100);

    expect(generateId()).toBe(100);
  });

  it("increments monotonically when the clock repeats or moves backwards", () => {
    const values = [100, 100, 99];
    const generateId = createMonotonicIdGenerator(() => values.shift()!);

    expect([generateId(), generateId(), generateId()]).toEqual([100, 101, 102]);
  });

  it("uses a later clock value when it advances beyond the sequence", () => {
    const values = [100, 250];
    const generateId = createMonotonicIdGenerator(() => values.shift()!);

    expect([generateId(), generateId()]).toEqual([100, 250]);
  });
});

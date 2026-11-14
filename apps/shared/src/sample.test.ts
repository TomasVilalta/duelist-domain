import { describe, expect, it } from "vitest";
import type { Seat } from "./index";

describe("shared test setup", () => {
  it("runs tests and resolves shared imports", () => {
    const seat: Seat = 0;
    expect(seat).toBe(0);
  });
});

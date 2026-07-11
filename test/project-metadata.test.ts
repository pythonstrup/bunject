import { describe, expect, test } from "bun:test";
import {
  assertStableRelease,
  isCalendarDate,
  parseProjectVersion,
} from "../scripts/project-metadata";

describe("project metadata", () => {
  test("accepts SemVer and identifies prereleases", () => {
    expect(parseProjectVersion("1.2.3")).toEqual({
      value: "1.2.3",
      prerelease: undefined,
    });
    expect(parseProjectVersion("1.2.3-beta.1+build.4")).toEqual({
      value: "1.2.3-beta.1+build.4",
      prerelease: "beta.1",
    });
    expect(() => parseProjectVersion("1.2.3-01")).toThrow();
    expect(() => parseProjectVersion("1.2.3-")).toThrow();
  });

  test("blocks prerelease publication without a dist-tag policy", () => {
    expect(() => assertStableRelease(parseProjectVersion("1.2.3"))).not.toThrow();
    expect(() =>
      assertStableRelease(parseProjectVersion("1.2.3-rc.1")),
    ).toThrow(/dist-tag/);
  });

  test("accepts only real ISO calendar dates", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-99-99")).toBe(false);
    expect(isCalendarDate("Unreleased")).toBe(false);
  });
});

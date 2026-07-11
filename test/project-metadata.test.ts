import { describe, expect, test } from "bun:test";
import {
  assertReleaseRepository,
  assertStableRelease,
  assertStableReleaseEvent,
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

  test("requires a stable event and exact GitHub repository metadata", () => {
    expect(() => assertStableReleaseEvent("false")).not.toThrow();
    expect(() => assertStableReleaseEvent("true")).toThrow(/prerelease/);
    expect(() => assertStableReleaseEvent(false)).toThrow(/prerelease/);
    expect(() => assertStableReleaseEvent(undefined)).toThrow(/prerelease/);

    const repository = {
      type: "git",
      url: "git+https://github.com/example/bunject.git",
    };
    expect(() =>
      assertReleaseRepository(repository, "example/bunject"),
    ).not.toThrow();
    expect(() =>
      assertReleaseRepository(repository, "Example/bunject"),
    ).toThrow(/exactly match/);
    expect(() =>
      assertReleaseRepository(
        { ...repository, type: "svn" },
        "example/bunject",
      ),
    ).toThrow(/exactly match/);
    expect(() => assertReleaseRepository(undefined, undefined)).toThrow(
      /GITHUB_REPOSITORY/,
    );
  });

  test("accepts only real ISO calendar dates", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-99-99")).toBe(false);
    expect(isCalendarDate("Unreleased")).toBe(false);
  });
});

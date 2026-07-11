const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export interface ProjectVersion {
  readonly value: string;
  readonly prerelease: string | undefined;
}

export function parseProjectVersion(value: unknown): ProjectVersion {
  if (typeof value !== "string") {
    throw new Error(`package.json contains an invalid SemVer version: ${value}`);
  }
  const match = semverPattern.exec(value);
  if (!match) {
    throw new Error(`package.json contains an invalid SemVer version: ${value}`);
  }
  return { value, prerelease: match[4] };
}

export function assertStableRelease(version: ProjectVersion): void {
  if (version.prerelease === undefined) return;
  throw new Error(
    "Prerelease publishing is intentionally blocked until an explicit npm " +
      "dist-tag policy is configured.",
  );
}

export function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

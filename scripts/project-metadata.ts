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

export function assertStableReleaseEvent(value: unknown): void {
  if (value === "false") return;
  throw new Error("A prerelease GitHub release cannot publish to npm latest.");
}

export function assertReleaseRepository(
  repository: unknown,
  githubRepository: string | undefined,
): void {
  const parts = githubRepository?.split("/");
  if (
    parts?.length !== 2 ||
    parts[0]?.length === 0 ||
    parts[1]?.length === 0
  ) {
    throw new Error("GITHUB_REPOSITORY must identify the release repository.");
  }

  const expected = `git+https://github.com/${githubRepository}.git`;
  if (
    typeof repository === "object" &&
    repository !== null &&
    Reflect.get(repository, "type") === "git" &&
    Reflect.get(repository, "url") === expected
  ) {
    return;
  }
  throw new Error(`package.json repository.url must exactly match ${expected}.`);
}

export function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

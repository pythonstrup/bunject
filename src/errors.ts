// @ts-self-types="./errors.d.ts"

import type { AnyToken } from "./types.js";

/** Stable machine-readable resolution failure category. */
export type ResolutionErrorCode =
  | "NOT_FOUND"
  | "MULTIPLE_PROVIDERS"
  | "CIRCULAR"
  | "ASYNC_IN_SYNC"
  | "CAPTIVE_DEPENDENCY"
  | "CONTAINER_BUSY"
  | "DISPOSED"
  | "PROVIDER_FAILED";

/** Stable machine-readable registration failure category. */
export type RegistrationErrorCode =
  | "INVALID_TOKEN"
  | "INVALID_PROVIDER"
  | "INVALID_MODULE"
  | "CONTAINER_BUSY"
  | "CONTAINER_DISPOSED"
  | "BINDING_MODE_CONFLICT"
  | "DUPLICATE_PROVIDER"
  | "NOT_REGISTERED";

/** Structured resolution failure with a stable code and dependency path. */
export class ResolutionError extends Error {
  readonly code: ResolutionErrorCode;
  readonly path: readonly AnyToken[];
  readonly cycle: readonly AnyToken[] | undefined;

  /** Creates a structured resolution failure. */
  constructor(
    code: ResolutionErrorCode,
    message: string,
    path: readonly AnyToken[],
    cause?: unknown,
    cycle?: readonly AnyToken[],
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ResolutionError";
    this.code = code;
    this.path = Object.freeze([...path]);
    this.cycle = cycle ? Object.freeze([...cycle]) : undefined;
  }
}

/** Structured registration failure with a stable code and optional token. */
export class RegistrationError extends TypeError {
  readonly code: RegistrationErrorCode;
  readonly token: AnyToken | undefined;

  /** Creates a structured registration failure. */
  constructor(
    code: RegistrationErrorCode,
    message: string,
    token?: AnyToken,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RegistrationError";
    this.code = code;
    this.token = token;
  }
}

export function enterPath(
  token: AnyToken,
  ancestry: readonly AnyToken[],
): readonly AnyToken[] {
  const cycleStart = ancestry.indexOf(token);
  if (cycleStart !== -1) {
    const cycle = [...ancestry.slice(cycleStart), token];
    throw resolutionError(
      "CIRCULAR",
      `Circular dependency detected: ${formatPath(cycle)}.`,
      [...ancestry, token],
      undefined,
      cycle,
    );
  }
  return [...ancestry, token];
}

export function providerFailure(
  path: readonly AnyToken[],
  cause: unknown,
): ResolutionError {
  const current = path[path.length - 1];
  return resolutionError(
    "PROVIDER_FAILED",
    `Provider ${current ? tokenName(current) : "<unknown>"} failed.`,
    path,
    cause,
  );
}

export function providerOrResolutionFailure(
  path: readonly AnyToken[],
  cause: unknown,
): ResolutionError {
  return cause instanceof ResolutionError ? cause : providerFailure(path, cause);
}

export function rebasePendingError(
  error: unknown,
  sharedToken: AnyToken,
  callerPath: readonly AnyToken[],
): unknown {
  if (
    !(error instanceof ResolutionError) ||
    error.code === "CIRCULAR" ||
    error.code === "ASYNC_IN_SYNC"
  ) {
    return error;
  }

  const sharedIndex = error.path.indexOf(sharedToken);
  if (sharedIndex === -1) {
    return error;
  }

  const path = [...callerPath, ...error.path.slice(sharedIndex + 1)];
  const marker = "\nResolution path:";
  const markerIndex = error.message.lastIndexOf(marker);
  const summary = markerIndex === -1 ? error.message : error.message.slice(0, markerIndex);
  return resolutionError(error.code, summary, path, error.cause);
}

export function resolutionError(
  code: ResolutionErrorCode,
  summary: string,
  path: readonly AnyToken[],
  cause?: unknown,
  cycle?: readonly AnyToken[],
): ResolutionError {
  return new ResolutionError(
    code,
    `${summary}\nResolution path: ${formatPath(path)}`,
    path,
    cause,
    cycle,
  );
}

export function registrationError(
  code: RegistrationErrorCode,
  message: string,
  token?: AnyToken,
  cause?: unknown,
): RegistrationError {
  return new RegistrationError(code, message, token, cause);
}

export function tokenName(value: AnyToken): string {
  return typeof value === "symbol"
    ? value.description || value.toString()
    : value.name || "<anonymous class>";
}

export function formatPath(path: readonly AnyToken[]): string {
  return path.map(tokenName).join(" -> ");
}

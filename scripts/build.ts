import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
await rm(join(root, "dist"), { recursive: true, force: true });

const child = Bun.spawn(
  [
    "bun",
    join(root, "node_modules/typescript/bin/tsc"),
    "-p",
    "tsconfig.build.json",
  ],
  { cwd: root, stderr: "inherit", stdout: "inherit" },
);
const exitCode = await child.exited;
if (exitCode !== 0) process.exit(exitCode);

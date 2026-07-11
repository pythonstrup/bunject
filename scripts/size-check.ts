import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const budgets = [
  { file: "dist/index.js", gzipBytes: 14 * 1024 },
  { file: "dist/index.d.ts", gzipBytes: 4 * 1024 },
] as const;

for (const budget of budgets) {
  const contents = await readFile(join(root, budget.file));
  const compressedBytes = gzipSync(contents, { level: 9 }).byteLength;
  if (compressedBytes > budget.gzipBytes) {
    throw new Error(
      `${budget.file} is ${compressedBytes} gzip bytes; ` +
        `the release budget is ${budget.gzipBytes}.`,
    );
  }
  console.log(
    `${budget.file}: ${compressedBytes} / ${budget.gzipBytes} gzip bytes`,
  );
}

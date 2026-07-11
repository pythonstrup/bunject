import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const budgets = [
  { extension: ".js", label: "dist/**/*.js", gzipBytes: 17 * 1024 },
  { extension: ".d.ts", label: "dist/**/*.d.ts", gzipBytes: 6 * 1024 },
] as const;

function filesWith(extension: string): string[] {
  return [
    ...new Bun.Glob(`**/*${extension}`).scanSync({
      absolute: true,
      cwd: dist,
      dot: true,
      onlyFiles: true,
    }),
  ].sort();
}

for (const budget of budgets) {
  const files = filesWith(budget.extension);
  if (files.length === 0) throw new Error(`No ${budget.label} files were built.`);
  const contents: Uint8Array[] = [];
  for (const file of files) {
    contents.push(
      Buffer.from(`${relative(dist, file).split(sep).join("/")}\0`),
      await readFile(file),
      Buffer.from("\0"),
    );
  }
  const compressedBytes = gzipSync(Buffer.concat(contents), {
    level: 9,
  }).byteLength;
  if (compressedBytes > budget.gzipBytes) {
    throw new Error(
      `${budget.label} is ${compressedBytes} gzip bytes; ` +
        `the release budget is ${budget.gzipBytes}.`,
    );
  }
  console.log(
    `${budget.label}: ${compressedBytes} / ${budget.gzipBytes} gzip bytes`,
  );
}

/**
 * What the real build actually emits.
 *
 * `test/unit` is pure by construction; this suite is where Fluidity checks things it can only
 * learn by running something real. Here that is esbuild: the config declares Obsidian, CodeMirror
 * and Lezer as externals because the app supplies one copy of each at runtime, and CodeMirror's
 * extension system keys off module identity — so a second bundled copy does not merely bloat the
 * plugin, it silently fails to interoperate with the editor. Nothing about that failure is visible
 * at build time, and a stray import is all it takes.
 *
 * So the invariant is stated as a property of the output rather than as a copy of the externals
 * list: every module the bundle requires at runtime must be one Obsidian provides.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** Build with the project's own esbuild config, into a scratch file rather than over `main.js`. */
function bundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "fluidity-bundle-"));
  const outfile = join(dir, "main.js");
  try {
    const result = spawnSync("node", ["esbuild.config.mjs", "production"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, FLUIDITY_BUNDLE_OUTFILE: outfile },
    });
    assert.equal(result.status, 0, `esbuild failed:\n${result.stderr}`);
    return readFileSync(outfile, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const built = bundle();

/** Obsidian's runtime provides these; anything else has to be bundled to exist at all. */
function providedByObsidian(specifier: string): boolean {
  if (specifier === "obsidian" || specifier === "electron") return true;
  if (specifier.startsWith("@codemirror/") || specifier.startsWith("@lezer/")) return true;
  return builtinModules.includes(specifier.replace(/^node:/, ""));
}

test("the bundle requires nothing Obsidian does not already provide", () => {
  const required = [...built.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  const bundledAnyway = required.filter((specifier) => !providedByObsidian(specifier));
  assert.deepEqual(bundledAnyway, [], "these should be bundled, or added to esbuild's externals");
});

test("the bundle is a CommonJS module with a default export", () => {
  // This is the contract Obsidian loads a plugin by: `module.exports.default` must be the class.
  assert.match(built, /module\.exports/);
  assert.match(built, /default:/);
});

test("a production bundle carries the generated-file banner and no inline sourcemap", () => {
  assert.match(built, /^\/\*\nTHIS IS A GENERATED\/BUNDLED FILE BY ESBUILD/);
  assert.doesNotMatch(built, /sourceMappingURL/);
});

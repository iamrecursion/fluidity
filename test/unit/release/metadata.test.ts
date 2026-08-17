/**
 * The release metadata has to agree with itself, in ways nothing else checks until a release is
 * already being cut.
 *
 * Obsidian finds a plugin release by looking for a git tag identical to `manifest.json`'s
 * `version`, then reads `versions.json` to decide which app versions may install it. The release
 * workflow asserts all of that against the tag, which is exactly the wrong time to discover a
 * mismatch — the tag is already pushed. These assertions are the same rules, minus the tag, run on
 * every `make check`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name: string): any => JSON.parse(readFileSync(new URL(`../../../${name}`, import.meta.url), "utf8"));

const manifest = read("manifest.json");
const pkg = read("package.json");
const versions = read("versions.json");

test("the manifest and package versions agree", () => {
  assert.equal(manifest.version, pkg.version);
});

test("the manifest version is bare semver, with no leading v", () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("versions.json maps the current version to the manifest's minAppVersion", () => {
  assert.equal(versions[manifest.version], manifest.minAppVersion);
});

test("every entry in versions.json names a real app version", () => {
  for (const [version, minAppVersion] of Object.entries(versions)) {
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.match(minAppVersion as string, /^\d+\.\d+\.\d+$/);
  }
});

test("the package is named after the plugin id", () => {
  assert.match(manifest.id, /^[a-z0-9-]+$/);
  assert.equal(pkg.name, `obsidian-${manifest.id}`);
});

test("the manifest and package descriptions are the same text", () => {
  // Two places state what the plugin is, and only one of them is what users see. Pinning them
  // together means the visible one cannot quietly fall behind.
  assert.equal(manifest.description, pkg.description);
});

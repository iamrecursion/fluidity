/**
 * Fluidity's entry point.
 *
 * This module owns the plugin lifecycle: installing the completer patch and handing its uninstaller
 * to `register()`, so that disabling the plugin puts Obsidian back as it was. Every decision
 * belongs to the modules beneath it, which is what lets them be tested without an editor.
 *
 * The fluent property is fixed here pending `settings/defs`, which will carry it along with the
 * master toggle and the status line that reports what `onload` found.
 */

import { Plugin } from "obsidian";

import { installFluentTitles } from "./suggest/patch";

/** The frontmatter property that marks a note fluent. */
const FLUENT_PROPERTY = "fluent";

export default class FluidityPlugin extends Plugin {
  override onload(): void {
    const result = installFluentTitles(this.app, { property: FLUENT_PROPERTY });
    if (result.installed) {
      this.register(result.uninstall);
      return;
    }

    // One line, naming the plugin: the completer keeps behaving exactly as it does without Fluidity
    // installed. The settings tab will report this where a user can see it.
    console.error(`Fluidity: ${result.reason} — fluent titles are off, completions are unchanged`);
  }
}

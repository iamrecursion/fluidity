/**
 * Fluidity's entry point.
 *
 * This module owns the plugin lifecycle: loading the settings, installing the completer patch and
 * taking it back off again, and registering the settings tab. Every decision belongs to the
 * modules beneath it, which is what lets them be tested without an editor.
 *
 * It is also the one place that knows the master toggle exists. Turning fluent titles off removes
 * the patch rather than making it inert, so that "off" means Obsidian is running the code it would
 * run without Fluidity installed — which is the only version of off worth offering for a plugin
 * whose whole mechanism is reaching past the public API.
 */

import { Plugin } from "obsidian";

import { DEFAULT_SETTINGS, type FluiditySettings, normalizeSettings } from "./settings/defs";
import { FluiditySettingTab } from "./settings/tab";
import { installFluentTitles, type PatchResult } from "./suggest/patch";

export default class FluidityPlugin extends Plugin {
  /** Read by the settings tab, and by the patch on every completion. */
  settings: FluiditySettings = { ...DEFAULT_SETTINGS };

  /** The completer patch, or `null` while fluent titles are off. */
  private patch: PatchResult | null = null;

  /** Whether Obsidian has taken the plugin down, which it may do mid-`onload`. */
  private unloaded = false;

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.storedSettings());

    // Reading the settings puts an `await` in `onload`, and Obsidian is free to unload a plugin
    // while one is pending. A patch installed past that point would never come off, because the
    // unload that would have removed it has already been and gone.
    if (this.unloaded) return;

    this.applySettings();

    // Added last as Obsidian asks a tab for its settings as soon as it is registered, and a status
    // line built before the patch was attempted would report a state nothing had reached.
    this.addSettingTab(new FluiditySettingTab(this.app, this));
  }

  /**
   * Put the completer back exactly as it was.
   *
   * The patch is taken off here rather than handed to `register()` at install time, because the
   * master toggle installs and removes it repeatedly within one session. There is no single
   * uninstaller to register, and registering each one as it is created would stack a callback per
   * toggle.
   */
  override onunload(): void {
    this.unloaded = true;
    this.removePatch();
  }

  /** Apply a change from the settings tab, act on it, and record it. */
  async updateSettings(change: Partial<FluiditySettings>): Promise<void> {
    this.settings = { ...this.settings, ...change };

    // Acted on before it is written, so that a save which fails leaves the plugin behaving the way
    // the settings tab says it does. Losing the record of a change is recoverable by making it
    // again; a toggle that reads off while the patch is still installed is not visible at all.
    this.applySettings();
    await this.saveData(this.settings);
  }

  /**
   * Why the completer is not patched, or `null` if it is.
   *
   * The settings tab words this; the fact is all that is reported here. While fluent titles are
   * off there is no failure to report, because nothing was attempted.
   */
  patchFailure(): string | null {
    return this.patch !== null && !this.patch.installed ? this.patch.reason : null;
  }

  /**
   * What is on disk, or nothing if it cannot be read.
   *
   * `data.json` is a file a user can open and edit, so it can hold text that is not JSON at all —
   * and `onload` is the one method in this plugin that must not fail, because a plugin that breaks
   * Obsidian's startup is one nobody can disable from inside Obsidian. A file that cannot be parsed
   * is reported once and treated as absent, which starts the plugin on its defaults rather than not
   * at all. What a parsed file *contains* is `settings/defs`'s problem, and it trusts none of it.
   */
  private async storedSettings(): Promise<unknown> {
    try {
      return await this.loadData();
    } catch (error) {
      console.error("Fluidity: settings could not be read, starting from the defaults", error);
      return null;
    }
  }

  /** Bring the patch into line with the master toggle. */
  private applySettings(): void {
    if (this.settings.fluentTitles) this.addPatch();
    else this.removePatch();
  }

  private addPatch(): void {
    // A result that is already recorded is left alone. Retrying a failed install on every keystroke
    // in the property field would log the same line over and over, for a reason that cannot have
    // changed; toggling off and on is how a retry is asked for.
    if (this.patch !== null) return;

    // The settings are passed as a function so that renaming the property takes effect on the next
    // completion rather than on the next reload.
    const result = installFluentTitles(this.app, () => ({ property: this.settings.fluentProperty }));
    this.patch = result;

    if (!result.installed) {
      // One line, naming the plugin: the completer keeps behaving exactly as it does without
      // Fluidity installed. The settings tab reports this where a user can see it, and says it
      // without borrowing the master toggle's word for a state the user did not ask for.
      console.error(`Fluidity: ${result.reason} — completions are unchanged`);
    }
  }

  private removePatch(): void {
    if (this.patch?.installed === true) this.patch.uninstall();
    this.patch = null;
  }
}

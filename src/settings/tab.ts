/**
 * The settings tab: the two controls, and the line that says whether the feature is running.
 */

import { type App, type IconName, PluginSettingTab, setIcon, type SettingDefinitionItem } from "obsidian";

import type FluidityPlugin from "../main";
import { DEFAULT_SETTINGS, type FluiditySettings, normalizeProperty } from "./defs";

/**
 * The mark drawn before the status word, each as a list of names to try in order.
 *
 * `IconName` is an alias for `string`, so nothing here is checked at build time — and Lucide
 * renamed the crossed octagon from `x-octagon` to `octagon-x`, which leaves the right name
 * depending on the Lucide the running Obsidian bundles. `setIcon` neither throws nor reports on a
 * name it does not have; it leaves the element empty, so the only way to ask is to look afterwards.
 */
const ACTIVE_ICONS: IconName[] = ["check"];
const INACTIVE_ICONS: IconName[] = ["octagon-x", "x-octagon"];

export class FluiditySettingTab extends PluginSettingTab {
  private readonly plugin: FluidityPlugin;

  constructor(app: App, plugin: FluidityPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    // `satisfies` rather than a plain return, so that every `key` below is checked against the
    // settings record. Without it a mistyped key is a control that silently reads and writes a
    // field nobody has, which looks exactly like a setting that does not save.
    return [
      {
        name: "Status",
        desc: this.status(),
        // It answers "why is nothing happening", which is not a question anyone searches for by
        // name, and it is not a setting.
        searchable: false,
      },
      {
        name: "Fluent titles",
        desc: "Lowercase a fluent note's display text when its link lands mid-sentence.",
        aliases: ["lowercase", "capitalization", "sentence case"],
        control: {
          type: "toggle",
          key: "fluentTitles",
          defaultValue: DEFAULT_SETTINGS.fluentTitles,
        },
      },
      {
        name: "Fluent property",
        desc: "Which frontmatter property marks a note fluent. Renaming it migrates nothing: notes still carrying"
          + " the old property stop being treated as fluent.",
        aliases: ["frontmatter", "property"],
        control: {
          type: "text",
          key: "fluentProperty",
          // An empty field means the default, which the placeholder is showing. There is no
          // `validate` here because there is nothing to reject: every string that can name a
          // property is accepted, and one that cannot is read as asking for the default.
          placeholder: DEFAULT_SETTINGS.fluentProperty,
          defaultValue: DEFAULT_SETTINGS.fluentProperty,
        },
      },
    ] satisfies SettingDefinitionItem<keyof FluiditySettings>[];
  }

  /**
   * Persist a changed control, and let the plugin act on it.
   *
   * Only the setter is overridden. The inherited reader already reports `plugin.settings`, which is
   * the record these keys name; the inherited writer would assign into it and save, which persists
   * the master toggle without ever installing or removing the patch it controls.
   */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "fluentTitles") {
      await this.plugin.updateSettings({ fluentTitles: value === true });

      // Redrawn because the status line above states what this toggle just did, and a settings tab
      // reporting the previous answer is worse than one reporting none. It is deliberately not done
      // for the property field: rebuilding the rows under a cursor would interrupt typing.
      this.update();
      return;
    }

    if (key === "fluentProperty") {
      await this.plugin.updateSettings({ fluentProperty: normalizeProperty(value) });
    }
  }

  /** Say whether completions are being adjusted, and if not, why not. */
  private status(): DocumentFragment {
    if (!this.plugin.settings.fluentTitles) {
      return statusLine(false, "fluent titles are turned off.");
    }

    const failure = this.plugin.patchFailure();
    if (failure === null) {
      return statusLine(true, "the link completer is adjusting fluent notes.");
    }

    // Named as Fluidity's own failure rather than Obsidian's, and paired with what still works: the
    // completer is untouched, so nothing a user does next is at risk.
    return statusLine(false, `Fluidity could not start: ${failure}. Completions are unchanged.`);
  }
}

/**
 * One word and a mark, then the sentence that says why.
 *
 * Only the word and its mark carry a color, because they are the part read at a glance; the
 * sentence after them is ordinary description text, and coloring a whole line red would make the
 * reason harder to read rather than easier to notice.
 */
function statusLine(active: boolean, detail: string): DocumentFragment {
  return createFragment((el) => {
    const mark = el.createSpan({ cls: ["fluidity-status", active ? "mod-active" : "mod-inactive"] });

    setFirstIcon(mark.createSpan({ cls: "fluidity-status-icon" }), active ? ACTIVE_ICONS : INACTIVE_ICONS);
    mark.createSpan({ text: active ? "Active" : "Inactive" });

    el.createSpan({ text: ` — ${detail}` });
  });
}

/** Draw the first of these icons the running Obsidian actually has, if it has any of them. */
function setFirstIcon(el: HTMLElement, names: IconName[]): void {
  for (const name of names) {
    setIcon(el, name);
    if (el.firstElementChild !== null) return;
  }
}

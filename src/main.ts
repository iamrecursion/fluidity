/**
 * Fluidity's entry point.
 *
 * This module owns lifecycle and nothing else: loading settings, installing the completer patch,
 * and registering the settings tab, delegating every decision to the modules beneath it. Keeping
 * it thin is what lets the rest of the plugin stay testable outside Obsidian.
 *
 * It is a placeholder for now — a plugin Obsidian will load and unload cleanly, so that the
 * scaffold has something real to build, check and install. The lifecycle arrives with the
 * fluent-titles feature.
 */

import { Plugin } from "obsidian";

export default class FluidityPlugin extends Plugin {}

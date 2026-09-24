.DEFAULT_GOAL := help

# Flakes are still gated behind experimental-feature flags in a default Nix install, so pass them
# explicitly rather than making every contributor edit nix.conf.
NIX := nix --extra-experimental-features 'nix-command flakes'

# Every target runs inside the Nix devshell, which is the single definition of this project's
# toolchain. `IN_NIX_SHELL` is set by `nix develop`, so tasks run naturally if already inside the
# shell.
ifeq ($(IN_NIX_SHELL),)
  RUN := $(NIX) develop --command
else
  RUN :=
endif

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

# -- Building -------------------------------------------------------------------------------------

# npm installs only the esbuild binary for the platform it runs on, and one checkout may be shared
# between platforms over a single node_modules — a container that builds and a host that runs
# Obsidian, for example. An install on either would otherwise leave the other with "You installed
# esbuild for another platform", so every binary that shares this checkout is put in place
# afterwards, at whatever version the lockfile resolved esbuild to.
#
# They cannot be declared in package.json: npm skips a dependency whose `os` does not match the
# machine installing it, and prunes it from node_modules on the next install.
#
# They are fetched with `npm pack` and unpacked because `npm install` refuses a foreign platform
# outright, and the one flag that overrides that, `--force`, also drops the engine and
# dependency-conflict checks `npm ci` has just applied and lets a fresh resolution rearrange the
# tree it laid down. `npm pack` only downloads; extracting the tarball into place touches nothing
# else in node_modules.
#
# Every esbuild in the tree is repaired, not just the top-level one: tsx carries its own copy at a
# different version, and a binary is only ever found beside the host that asks for it. Leaving a
# nested host to fall back on the top-level binary is how `Host version X does not match binary
# version Y` happens, which stops the test runner dead while the build itself is fine.
ESBUILD_PLATFORMS := @esbuild/darwin-arm64 @esbuild/linux-arm64

# Prints the `version` field of the package.json given as its argument.
pkg-version = sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'

.PHONY: deps
deps: ## Install npm dependencies exactly as locked, for every platform sharing this checkout
	$(RUN) npm ci
	@if [ -n "$(CI)" ]; then \
	  echo "CI: skipping the cross-platform esbuild repair — a runner shares its node_modules with nothing."; \
	  exit 0; \
	fi; \
	tmp=$$(mktemp -d); \
	trap 'rm -rf "$$tmp"' EXIT; \
	for host in $$(find node_modules -path '*/esbuild/package.json' -not -path '*/@esbuild/*'); do \
	  nm=$$(dirname "$$(dirname "$$host")"); \
	  v=$$($(pkg-version) "$$host" | head -1); \
	  for p in $(ESBUILD_PLATFORMS); do \
	    have=$$($(pkg-version) "$$nm/$$p/package.json" 2>/dev/null | head -1); \
	    if [ "$$have" != "$$v" ]; then \
	      tarball=$$($(RUN) npm pack --silent --pack-destination "$$tmp" "$$p@$$v") || exit 1; \
	      rm -rf "$$nm/$$p"; \
	      mkdir -p "$$nm/$$p"; \
	      tar -xzf "$$tmp/$$tarball" -C "$$nm/$$p" --strip-components=1 || exit 1; \
	      echo "Unpacked $$p@$$v into $$nm."; \
	    fi; \
	  done; \
	done

.PHONY: build
build: typecheck ## Produce a release main.js
	$(RUN) npm run bundle

.PHONY: dev
dev: ## Rebuild main.js on every change, with sourcemaps (Ctrl-C to stop)
	$(RUN) npm run bundle:watch

# -- Checking -------------------------------------------------------------------------------------

.PHONY: typecheck
typecheck: ## Type-check src/ and test/ without emitting
	$(RUN) npm run typecheck

.PHONY: lint
lint: ## Run ESLint over the whole repository
	$(RUN) npm run lint

.PHONY: format-check
format-check: ## Report formatting that `make format` would change
	$(RUN) dprint check

.PHONY: test-unit
test-unit: ## Run the pure unit tests
	$(RUN) npm run test:unit

.PHONY: test-integration
test-integration: ## Run the tests that pin what we assume of Obsidian
	$(RUN) npm run test:integration

.PHONY: test
test: test-unit test-integration ## Run every test

.PHONY: check
check: format-check typecheck lint test ## Everything CI checks

# -- Installing -----------------------------------------------------------------------------------

# `install`, `link` and `unlink` are three ways into the same vault folder, so they share these
# guards. `$@` expands where the block is used, which is what lets one copy name the target the
# user actually ran. Both checks happen before anything expensive, so a typo in DEV_VAULT_PATH
# costs a second rather than a full build.
define vault-guard
	@if [ -z "$(DEV_VAULT_PATH)" ]; then \
	  echo "make $@: DEV_VAULT_PATH is not set." >&2; \
	  echo "  DEV_VAULT_PATH=~/vaults/dev make $@" >&2; \
	  exit 1; \
	fi
	@if [ ! -d "$(DEV_VAULT_PATH)/.obsidian" ]; then \
	  echo "make $@: '$(DEV_VAULT_PATH)' is not an Obsidian vault (no .obsidian directory)." >&2; \
	  exit 1; \
	fi
endef

# The three files Obsidian installs, in the folder it loads a plugin from.
PLUGIN_FILES := main.js manifest.json styles.css

# That folder must be named after manifest.json's `id`, which is read out of the manifest rather
# than hardcoded, so a rename cannot leave these targets working on a stale directory. It is read
# with sed rather than node because a machine that only runs Obsidian needs no toolchain to manage
# its own vault, and requiring one is what turns a broken install into a hand-written `rm`.
plugin-id = sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1

# Where Obsidian loads this plugin from inside `$DEV_VAULT_PATH`, named once because three targets
# act on it: a drift between them would have one working on a directory another had ruled out.
vault-dest = id=$$($(plugin-id)); dest="$(DEV_VAULT_PATH)/.obsidian/plugins/$$id"

# What is at the destination, in one word:
#
#   links      a real directory holding symlinks into a checkout — what `make link` builds
#   whole-link the directory is itself one symlink to a checkout
#   copied     a real directory of real files — an install, possibly with its data.json
#   other      something else, which nothing here will touch
#   absent     nothing
#
# `whole-link` is not a shape any target here produces, but a vault may still carry one and it is
# the shape worth naming, because it is the one that makes `rm` dangerous. See `link`.
dest-shape = if [ -L "$$dest" ]; then echo whole-link; elif [ -L "$$dest/main.js" ]; then echo links; elif [ -d "$$dest" ]; then echo copied; elif [ -e "$$dest" ]; then echo other; else echo absent; fi

# Which checkout a linked destination follows, for either linked shape. Empty when it resolves to
# nothing. Shape alone is not enough to act on: a vault may be linked to a *different* checkout of
# this repository, and every target here would otherwise treat that as its own.
dest-target = if [ -L "$$dest" ]; then cd "$$dest" 2>/dev/null && pwd -P; elif [ -L "$$dest/main.js" ]; then t=$$(readlink "$$dest/main.js"); [ -n "$$t" ] && cd "$$dest" 2>/dev/null && cd "$$(dirname "$$t")" 2>/dev/null && pwd -P; fi

# The destination is checked before `build` rather than alongside it; that is what the recursive
# `$(MAKE)` buys, since prerequisite order is not guaranteed under `-j`.
.PHONY: install
install: ## Build and install into the vault at $DEV_VAULT_PATH
	$(vault-guard)
	@$(MAKE) --no-print-directory build
	@$(vault-dest); \
	case $$($(dest-shape)) in \
	links|whole-link) \
	  target=$$($(dest-target)); \
	  if [ "$$target" = "$$(pwd -P)" ]; then \
	    echo "$$dest links to this checkout, so the build it already sees is the one just made."; \
	    echo "Reload Obsidian, or disable and re-enable the plugin, to pick it up."; \
	  else \
	    echo "make install: '$$dest' links to '$${target:-a checkout that cannot be resolved}', not this one." >&2; \
	    echo "  Obsidian would go on loading that one, so this build has not been installed." >&2; \
	    echo "  'make unlink' replaces the links with this checkout's build." >&2; \
	    exit 1; \
	  fi; \
	  ;; \
	other) \
	  echo "make install: '$$dest' exists and is not a plugin directory." >&2; \
	  exit 1; \
	  ;; \
	*) \
	  mkdir -p "$$dest"; \
	  for f in $(PLUGIN_FILES); do rm -f "$$dest/$$f"; done; \
	  cp $(PLUGIN_FILES) "$$dest/" || exit 1; \
	  echo "Installed $$id into $$dest."; \
	  echo "Reload Obsidian, or disable and re-enable the plugin, to pick the build up."; \
	  ;; \
	esac

# `link` is `install` without the copy: the plugin folder is real, and the files inside it are
# symlinks into this checkout, so `make dev`'s rebuilt main.js is live in the vault with no second
# step.
#
# Linking the files rather than the folder is what makes the arrangement safe to remove. `rm`
# deletes a symlink instead of following it, so every way of clearing the plugin folder out costs
# three links this target rebuilds in a second, and none of them can reach the checkout. Linking
# the folder gives that same `rm` a way through: a trailing slash — which shell completion appends
# for you — deletes the contents of what it points at, silently, reporting nothing.
#
# It deliberately does not build: you link once and leave `make dev` running, so a fresh checkout
# has no main.js yet and its link dangles until the first build, hence the reminder.
#
# `FORCE=1` takes over a destination this would otherwise refuse: a copied install, a whole-folder
# symlink, or links following a different checkout. It stays opt-in because those files are
# somebody's, and it is safe because of what it will not do. No directory is ever removed: a copied
# install loses the plugin's three files by name, which this checkout rebuilds in a second, and a
# whole-folder symlink loses the link itself, never what it points at. `data.json` is the one thing
# in that folder nobody can regenerate, so it is left where it lies — or carried across when the
# folder *was* the link and the settings are therefore sitting in the checkout. A destination that
# is not a plugin directory is refused either way: force is permission to replace this plugin's
# files, not a licence to guess at somebody else's.
.PHONY: link
link: ## Symlink this checkout's files into the vault at $DEV_VAULT_PATH (FORCE=1 to take one over)
	$(vault-guard)
	@$(vault-dest); \
	here=$$(pwd -P); \
	case $$($(dest-shape)) in \
	copied) \
	  if [ -z "$(FORCE)" ]; then \
	    echo "make link: '$$dest' holds an installed copy of the plugin, and possibly its data.json." >&2; \
	    echo "  'FORCE=1 make link' replaces the plugin's files with links and leaves data.json alone." >&2; \
	    echo "  Or remove it yourself once you are sure, then re-run: rm -r '$$dest'" >&2; \
	    exit 1; \
	  fi; \
	  for f in $(PLUGIN_FILES); do rm -f "$$dest/$$f"; done; \
	  echo "Took over the copied install in $$dest; anything else there, data.json included, is untouched."; \
	  ;; \
	whole-link) \
	  if [ -z "$(FORCE)" ]; then \
	    echo "make link: '$$dest' is a symlink to a whole checkout, which this target no longer makes." >&2; \
	    echo "  'FORCE=1 make link' replaces it with a folder of links, carrying data.json across." >&2; \
	    echo "  'make unlink' replaces it with a copied build, or remove it with no trailing slash: rm '$$dest'" >&2; \
	    echo "  'rm -r $$dest/' would instead delete the contents of the checkout it points at." >&2; \
	    exit 1; \
	  fi; \
	  was=$$($(dest-target)); \
	  rm "$$dest"; \
	  mkdir -p "$$dest"; \
	  if [ -n "$$was" ] && [ -f "$$was/data.json" ]; then \
	    cp "$$was/data.json" "$$dest/" || exit 1; \
	    echo "Carried data.json across from $$was, so the plugin keeps the settings it had while linked."; \
	  fi; \
	  echo "Replaced the whole-folder symlink at $$dest; $${was:-what it pointed at} is untouched."; \
	  ;; \
	other) \
	  echo "make link: '$$dest' exists and is not a plugin directory." >&2; \
	  echo "  FORCE=1 does not reach this: it replaces this plugin's files, and will not guess at others'." >&2; \
	  exit 1; \
	  ;; \
	esac; \
	target=$$($(dest-target)); \
	if [ -n "$$target" ] && [ "$$target" != "$$here" ] && [ -z "$(FORCE)" ]; then \
	  echo "make link: '$$dest' links to '$$target', not this checkout." >&2; \
	  echo "  'FORCE=1 make link' re-points them here, deleting nothing: a symlink is replaced, not followed." >&2; \
	  echo "  Its contents are symlinks, so removing it reaches no checkout: rm -r '$$dest'" >&2; \
	  exit 1; \
	fi; \
	mkdir -p "$$dest"; \
	for f in $(PLUGIN_FILES); do \
	  ln -sfn "$$here/$$f" "$$dest/$$f" || exit 1; \
	done; \
	echo "Linked $$dest -> $$here ($(PLUGIN_FILES))."; \
	if [ ! -f main.js ]; then \
	  echo "No main.js yet: run 'make dev' (or 'make build') before enabling the plugin."; \
	fi

# `unlink` is the way back from `link` to an ordinary install: replace the links with the files
# they point at.
#
# Its whole job is to get a vault off a checkout, so a build it cannot run is not allowed to stop
# it. The machine holding the vault may have no working toolchain at all — a shared node_modules
# carries one platform's binaries at a time — and failing there would leave a hand-written `rm` as
# the only way out, which is the thing this target exists to spare you. A failed build with a
# main.js already present installs that one and says so; only a destination with nothing at all to
# copy is an error.
#
# `data.json` is carried across from the checkout when the whole folder was a link, because that is
# where a plugin linked that way has been writing its settings. Under `link` it is already a real
# file in the vault, and is left alone.
.PHONY: unlink
unlink: ## Replace the $DEV_VAULT_PATH links with a copied build
	$(vault-guard)
	@$(vault-dest); \
	shape=$$($(dest-shape)); \
	case $$shape in \
	links|whole-link) ;; \
	copied) \
	  echo "make unlink: '$$dest' is already a copied install, not a link." >&2; \
	  echo "  'make install' refreshes it in place." >&2; \
	  exit 1; \
	  ;; \
	*) \
	  echo "make unlink: nothing is linked at '$$dest'." >&2; \
	  echo "  'make install' puts a copied build there." >&2; \
	  exit 1; \
	  ;; \
	esac; \
	was=$$($(dest-target)); \
	if [ -n "$$was" ] && [ "$$was" != "$$(pwd -P)" ]; then \
	  echo "make unlink: '$$dest' links to '$$was'; this checkout's build is what replaces it." >&2; \
	fi; \
	if ! $(MAKE) --no-print-directory build; then \
	  if [ -f main.js ]; then \
	    echo "make unlink: the build failed, so the main.js already in this checkout is the one installed." >&2; \
	  else \
	    echo "make unlink: the build failed, and there is no main.js to install instead." >&2; \
	    echo "  '$$dest' is untouched, and still links to $${was:-somewhere unresolvable}." >&2; \
	    exit 1; \
	  fi; \
	fi; \
	if [ "$$shape" = whole-link ]; then \
	  rm "$$dest"; \
	  mkdir -p "$$dest"; \
	else \
	  for f in $(PLUGIN_FILES); do rm -f "$$dest/$$f"; done; \
	fi; \
	cp $(PLUGIN_FILES) "$$dest/" || exit 1; \
	if [ "$$shape" = whole-link ] && [ -n "$$was" ] && [ -f "$$was/data.json" ]; then \
	  cp "$$was/data.json" "$$dest/" || exit 1; \
	  echo "Copied data.json across from $$was, so the plugin keeps the settings it had while linked."; \
	fi; \
	echo "Unlinked $$id: $$dest holds a copy of the build, and no longer links to $${was:-anything}."; \
	echo "Reload Obsidian, or disable and re-enable the plugin, to pick it up."

# -- Utility --------------------------------------------------------------------------------------

.PHONY: format
format: ## Reformat Markdown, JSON, CSS and TypeScript
	$(RUN) dprint fmt

.PHONY: clean
clean: ## Remove build output, keeping node_modules
	rm -rf main.js main.js.map

.PHONY: distclean
distclean: clean ## Also remove node_modules
	rm -rf node_modules

.PHONY: shell
shell: ## Launch $$SHELL inside the devshell
	$(NIX) develop --command $(shell echo $$SHELL)

.PHONY: editor
editor: ## Launch $$EDITOR inside the devshell
	$(NIX) develop --command $(EDITOR)

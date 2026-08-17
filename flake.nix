{
  description = "Fluidity: links that read like prose, inside Obsidian";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        # Everything needed to build, test, lint and release the plugin. CI runs inside this same
        # shell, so `make check` locally is what CI executes — there is no second copy of the
        # toolchain to drift from this one.
        devShells.default = pkgs.mkShell {
          packages = [
            # JavaScript and TypeScript
            pkgs.nodejs_24

            # Tooling
            pkgs.git
            pkgs.gnumake

            # Formatting
            pkgs.dprint
          ];
        };

        formatter = pkgs.nixfmt;
      }
    );
}

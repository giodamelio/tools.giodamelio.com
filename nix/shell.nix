{lib, ...}: {
  perSystem = {
    pkgs,
    config,
    scriptNames,
    ...
  }: {
    devShells.default = pkgs.mkShell {
      packages =
        [pkgs.nodejs pkgs.wrangler pkgs.hurl pkgs.gomplate pkgs.jq pkgs.little_boxes]
        # The same scripts `nix run` exposes, on PATH by bare name.
        ++ map (name: config.packages.${name}) scriptNames;

      CLOUDFLARE_ACCOUNT_ID = "dd00af6bb2aa48a10ddf29a3a20cf429";

      # worker/index.js imports ./tool-routes.js, which nix/worker.nix writes
      # from each tool's declared routes. Link it in rather than committing a
      # generated file, so the Worker resolves and reads the same in an editor
      # as it does under wrangler. It changes only when a tool's routes do.
      shellHook = ''
        ln -sfn ${config.packages.tool-routes}/tool-routes.js worker/tool-routes.js

        printf '%s\n' ${lib.escapeShellArgs scriptNames} \
          | little_boxes --title "scripts"
      '';
    };
  };
}

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

      shellHook = ''
        printf '%s\n' ${lib.escapeShellArgs scriptNames} \
          | little_boxes --title "scripts"
      '';
    };
  };
}

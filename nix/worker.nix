{lib, ...}: {
  perSystem = {
    pkgs,
    tools,
    ...
  }: let
    # A tool's routes are relative to its own mount, so they mean the same
    # thing wherever it is mounted. Prefixing happens here, once.
    routes =
      lib.concatMap
      (drv:
        map (route: {
          pattern = "^" + lib.escapeRegex drv.basePath + lib.removePrefix "^" route;
          page = drv.basePath;
        })
        drv.passthru.tool.routes)
      (lib.attrValues tools);

    context = pkgs.writeText "routes.json" (builtins.toJSON {inherit routes;});
  in {
    # The one file under worker/ that Nix has to write. Everything else the
    # Worker needs is either checked in beside it or is packages.site.
    packages.tool-routes = pkgs.runCommand "tool-routes" {nativeBuildInputs = [pkgs.gomplate];} ''
      mkdir -p $out
      gomplate -c .=${context} -f ${../worker/tool-routes.js.tmpl} -o $out/tool-routes.js
    '';
  };
}

{lib, ...}: {
  perSystem = {
    pkgs,
    config,
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
    packages.worker = pkgs.runCommand "worker" {nativeBuildInputs = [pkgs.gomplate];} ''
      mkdir -p $out
      cp ${../worker/index.js} $out/index.js
      cp ${../worker/wrangler.jsonc} $out/wrangler.jsonc
      cp -r ${../worker/keeper-of-state} $out/keeper-of-state
      cp -r ${../worker/migrations} $out/migrations
      cp -r ${config.packages.site} $out/public

      gomplate -c .=${context} -f ${../worker/tool-routes.js.tmpl} -o $out/tool-routes.js

      chmod -R u+w $out
    '';
  };
}

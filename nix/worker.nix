{lib, ...}: {
  perSystem = {
    pkgs,
    tools,
    ...
  }: let
    # A tool's routes are relative to its own mount, so they mean the same
    # thing wherever it is mounted. Prefixing happens here, once.
    prefixed = drv: route: "^" + lib.escapeRegex drv.basePath + lib.removePrefix "^" route;

    # A tool with a preview Worker gets its og:* tags added to every page route
    # and hands its card route to that Worker over a service binding.
    routes =
      lib.concatMap
      (drv: let
        preview = drv.passthru.tool.preview or null;
      in
        map (route:
          {
            pattern = prefixed drv route;
            page = drv.basePath;
          }
          // lib.optionalAttrs (preview != null) {preview = preview.binding;})
        drv.passthru.tool.routes
        ++ lib.optional (preview != null) {
          pattern = prefixed drv preview.card;
          service = preview.binding;
        })
      (lib.attrValues tools);

    context = pkgs.writeText "routes.json" (builtins.toJSON {inherit routes;});

    previews =
      lib.mapAttrs (_: drv: drv.passthru.tool.preview)
      (lib.filterAttrs (_: drv: drv.passthru.tool ? preview) tools);
  in {
    # Each preview's Worker and its config's directory relative to the project root, for the scripts in
    # nix/apps.nix and the devShell.
    _module.args.previews =
      lib.mapAttrsToList (slug: preview: {
        inherit (preview) worker;
        dir = "tools/${slug}/${preview.dir}";
      })
      previews;

    packages =
      {
        # The one file under worker/ that Nix has to write. Everything else the
        # Worker needs is either checked in beside it or is packages.site.
        tool-routes = pkgs.runCommand "tool-routes" {nativeBuildInputs = [pkgs.gomplate];} ''
          mkdir -p $out
          gomplate -c .=${context} -f ${../worker/tool-routes.js.tmpl} -o $out/tool-routes.js
        '';
      }
      // lib.mapAttrs' (slug: preview: lib.nameValuePair "preview-${slug}" preview.worker) previews;
  };
}

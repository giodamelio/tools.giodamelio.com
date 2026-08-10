{lib, ...}: {
  perSystem = {
    pkgs,
    tools,
    ...
  }: let
    ordered =
      lib.sort (a: b: a.tool.order < b.tool.order)
      (lib.mapAttrsToList (slug: drv: {
          inherit slug drv;
          tool = drv.passthru.tool;
        })
        tools);

    # Nix's only job is turning passthru into data. Everything user-visible is
    # rendered by gomplate from a template you can read.
    context = pkgs.writeText "tools.json" (builtins.toJSON {
      tools =
        map (t: {
          inherit (t) slug;
          mount = t.drv.basePath;
          inherit (t.tool) name description order;
        })
        ordered;
    });
  in {
    packages.site = pkgs.runCommand "site" {nativeBuildInputs = [pkgs.gomplate];} ''
      mkdir -p $out
      cp ${../css/base.css} $out/base.css
      cp ${../site/site.css} $out/site.css

      gomplate -c .=${context} -f ${../site/index.html.tmpl} -o $out/index.html
      gomplate -c .=${context} -f ${../site/index.md.tmpl} -o $out/index.md

      ${lib.concatMapStringsSep "\n" (t: "cp -r ${t.drv} $out/${t.slug}") ordered}

      chmod -R u+w $out
    '';
  };
}

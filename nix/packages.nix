{lib, ...}: {
  perSystem = {pkgs, ...}: let
    baseCss = pkgs.runCommand "base-css" {} ''
      mkdir -p $out
      cp ${../css/base.css} $out/base.css
    '';

    # A tool is any directory under tools/. Adding one is creating a directory
    # with a package.nix in it; nothing here or anywhere else needs editing.
    toolNames =
      lib.attrNames
      (lib.filterAttrs (_: type: type == "directory") (builtins.readDir ../tools));

    tools =
      lib.genAttrs toolNames
      (name:
        pkgs.callPackage (../tools + "/${name}/package.nix") {
          inherit baseCss;
          basePath = "/${name}/";
        });
  in {
    _module.args.tools = tools;

    packages =
      {base-css = baseCss;}
      // lib.mapAttrs' (name: lib.nameValuePair "tool-${name}") tools;
  };
}

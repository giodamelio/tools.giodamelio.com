{
  stdenvNoCC,
  baseCss,
  basePath,
  ...
}:
stdenvNoCC.mkDerivation {
  pname = "tool-units";
  version = "1";

  src = ./.;

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out
    cp index.html units.css search.js solver.js masonry.js grid-lanes-polyfill.js $out/
    cp ${baseCss}/base.css $out/base.css
    substituteInPlace $out/index.html --subst-var basePath

    runHook postInstall
  '';

  inherit basePath;

  passthru.tool = {
    name = "Units";
    description = "A quick reference for common unit conversions";
    order = 1;
    routes = [];
  };
}

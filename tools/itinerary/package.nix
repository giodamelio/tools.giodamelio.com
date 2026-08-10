{
  stdenvNoCC,
  basePath,
  ...
}:
# No build step and no base stylesheet: the page is styled entirely from its
# own inline <style> block and a dark-first palette of its own.
stdenvNoCC.mkDerivation {
  pname = "tool-itinerary";
  version = "1";

  src = ./.;

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out
    cp index.html itinerary.js render.js zone-data.js llm.md $out/
    substituteInPlace $out/index.html --subst-var basePath

    runHook postInstall
  '';

  inherit basePath;

  passthru.tool = {
    name = "Itinerary";
    description = "Plan a trip across time zones, then share it with a link";
    order = 2;

    # Trip permalinks, relative to wherever this tool is mounted. itinerary.js
    # matches the same pattern against the path below its <base>.
    routes = ["^[23456789bcdfghjkmnpqrstvwxz]{14}(?:/edit)?/?$"];
  };
}

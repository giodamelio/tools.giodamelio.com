{
  stdenvNoCC,
  importNpmLock,
  nodejs,
  basePath,
  ...
}:
# A Vite build rather than a copy, and no base stylesheet: the page is styled
# entirely from its own tokens and a dark-first palette of its own.
#
# importNpmLock reads package-lock.json directly, so the lockfile is the only
# thing to keep current — there is no vendor hash to update alongside it.
stdenvNoCC.mkDerivation {
  pname = "tool-itinerary";
  version = "2";

  src = ./.;

  nativeBuildInputs = [nodejs importNpmLock.npmConfigHook];
  npmDeps = importNpmLock {npmRoot = ./.;};

  # A type error or a broken date calculation should fail the build, not just
  # the editor. Linting stays out: a formatting rule must not block a deploy.
  buildPhase = ''
    runHook preBuild

    npm run typecheck
    npm run test
    npm run build

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out
    cp -r dist/. $out/
    substituteInPlace $out/index.html --subst-var basePath

    runHook postInstall
  '';

  inherit basePath;

  passthru.tool = {
    name = "Itinerary";
    description = "Plan a trip across time zones, then share it with a link";
    order = 2;

    # Trip permalinks, relative to wherever this tool is mounted. src/router.ts
    # matches the same pattern against the path below its <base>.
    routes = ["^[23456789bcdfghjkmnpqrstvwxz]{14}(?:/edit)?/?$"];
  };
}

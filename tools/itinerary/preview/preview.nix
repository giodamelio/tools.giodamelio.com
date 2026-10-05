{
  lib,
  stdenv,
  runCommand,
  rustPlatform,
  rustc,
  cargo,
  lld,
  worker-build,
  wasm-bindgen-cli_0_2_126,
  binaryen,
  esbuild,
  python3Packages,
  inter,
}:
# The itinerary's link preview Worker. It is not a tool, so it lives in preview.nix rather than package.nix,
# where nix/packages.nix would discover it as one; package.nix exposes it through passthru.tool.preview.
let
  # Inter 4's variable font, instanced at the text optical size in the two weights the card uses and
  # subset to Latin, dashes, quotes, arrows and the ellipsis. Place names outside that render as boxes.
  fonts = runCommand "itinerary-preview-fonts" {nativeBuildInputs = [python3Packages.fonttools];} ''
    mkdir -p $out
    for spec in 400:Regular 700:Bold; do
      fonttools varLib.instancer -q ${inter}/share/fonts/truetype/InterVariable.ttf \
        wght=''${spec%%:*} opsz=14 -o instance.ttf
      pyftsubset instance.ttf \
        --unicodes="U+0020-007E,U+00A0-024F,U+2010-2027,U+2030-205E,U+2190-2199,U+20AC" \
        --layout-features="kern,liga,calt" \
        --output-file=$out/Inter-''${spec##*:}.ttf
    done
  '';
in
  stdenv.mkDerivation {
    pname = "itinerary-preview";
    version = "1";

    src = lib.fileset.toSource {
      root = ./.;
      fileset = lib.fileset.unions [./Cargo.toml ./Cargo.lock ./src];
    };

    # Read straight from the lockfile, like importNpmLock: no vendor hash to keep in step.
    cargoDeps = rustPlatform.importCargoLock {lockFile = ./Cargo.lock;};

    nativeBuildInputs = [
      rustPlatform.cargoSetupHook
      cargo
      rustc
      lld
      worker-build
      wasm-bindgen-cli_0_2_126
      binaryen
      esbuild
    ];

    CARD_FONTS_DIR = fonts;

    # worker-build downloads its own wasm-bindgen, wasm-opt and esbuild unless pointed at these.
    WASM_BINDGEN_BIN = "wasm-bindgen";
    WASM_OPT_BIN = "wasm-opt";
    ESBUILD_BIN = "esbuild";

    # A broken date format or a layout that no longer fits should fail the build, not the deploy.
    buildPhase = ''
      runHook preBuild

      cargo test --release
      RUSTFLAGS="-C target-feature=+simd128" worker-build --release

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out
      cp build/index.js build/index_bg.wasm $out/

      runHook postInstall
    '';

    passthru = {
      inherit fonts;
      # For `cargo test` and examples/cards.rs in the devShell.
      devPackages = [cargo rustc lld worker-build wasm-bindgen-cli_0_2_126 binaryen esbuild];
      devEnv.CARD_FONTS_DIR = fonts;
    };
  }

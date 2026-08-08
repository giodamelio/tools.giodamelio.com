{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
  packages = with pkgs; [
    wrangler
    little_boxes
    hurl
  ];

  enterShell = ''
    devenv tasks list --no-tui 2>/dev/null \
      | grep -v 'devenv:' \
      | little_boxes --title "devenv tasks"
  '';

  env.CLOUDFLARE_ACCOUNT_ID = "dd00af6bb2aa48a10ddf29a3a20cf429";

  languages.javascript.enable = true;

  # Local dev server with live reload (auto-refreshes the browser on change).
  # Start with `devenv up`; serves ./src on http://localhost:8788.
  # https://devenv.sh/processes/
  processes.dev.exec = "wrangler dev --live-reload --port 8788";

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  tasks = {
    "site:publish".exec = "wrangler deploy";

    # Uploads a version without routing production traffic to it, and prints a
    # preview URL. Set PREVIEW_ALIAS to name the URL's subdomain label.
    "site:publish:preview".exec = ''
      wrangler versions upload --preview-alias "''${PREVIEW_ALIAS:-preview}"
    '';

    # Refreshes src/itinerary/zone-data.js from @vvo/tzdb, a published
    # conversion of the IANA time zone database. Only needed when tzdb renames
    # a zone, which is a few times a year at most.
    "itinerary:zones".exec = "node $DEVENV_ROOT/scripts/build-zone-data.js";

    "keeper:migrate".exec = "wrangler d1 migrations apply keeper-of-state --local";

    "keeper:migrate:remote".exec = "wrangler d1 migrations apply keeper-of-state --remote";

    # Runs the Hurl suite against a running `devenv up` server. Set KEEPER_BASE
    # to aim it at a preview deploy instead. The suite needs an oversize request
    # body to prove the 100 KB limit; it is generated here rather than committed,
    # and --file-root points Hurl at the generated copy.
    "keeper:test".exec = ''
      fixtures="$DEVENV_STATE/keeper-of-state"
      mkdir -p "$fixtures"
      { printf '{"filler":"'; head -c 102400 /dev/zero | tr '\0' 'x'; printf '"}'; } > "$fixtures/oversize.json"

      hurl --test \
        --file-root "$fixtures" \
        --variable base="''${KEEPER_BASE:-http://localhost:8788}" \
        "$DEVENV_ROOT/worker/keeper-of-state/test.hurl"
    '';
  };

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;
}

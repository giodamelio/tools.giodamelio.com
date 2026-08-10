{lib, ...}: {
  perSystem = {
    pkgs,
    config,
    ...
  }: let
    accountId = "dd00af6bb2aa48a10ddf29a3a20cf429";

    # Wrangler resolves `main` against its config, so it runs in worker/, where
    # the config, the entry point and the migrations already are and where
    # .wrangler/ can be written. Run these from the project root.
    #
    # index.js imports ./tool-routes.js, so relink it here rather than trusting
    # the devShell to have done it: outside `nix develop` the file is missing and
    # wrangler cannot resolve the import, and a shell opened before a tool's
    # routes changed holds a link to an older store path, which would deploy a
    # stale route table without complaining.
    inWorker = ''
      export CLOUDFLARE_ACCOUNT_ID=${accountId}
      cd worker
      ln -sfn ${config.packages.tool-routes}/tool-routes.js tool-routes.js
    '';

    # The built site, passed rather than linked: it is a build output, and
    # naming it here is what keeps every run serving what the sources say now.
    site = "--assets ${config.packages.site}";

    scripts = {
      deploy = {
        text = ''
          ${inWorker}
          exec wrangler deploy ${site}
        '';
        inputs = [pkgs.wrangler];
      };

      deploy-preview = {
        text = ''
          ${inWorker}
          exec wrangler versions upload ${site} --preview-alias "''${PREVIEW_ALIAS:-preview}"
        '';
        inputs = [pkgs.wrangler];
      };

      serve = {
        text = ''
          ${inWorker}
          exec wrangler dev ${site} --port 8788 "$@"
        '';
        inputs = [pkgs.wrangler];
      };

      keeper-migrate = {
        text = ''
          ${inWorker}
          exec wrangler d1 migrations apply keeper-of-state --local
        '';
        inputs = [pkgs.wrangler];
      };

      keeper-migrate-remote = {
        text = ''
          ${inWorker}
          exec wrangler d1 migrations apply keeper-of-state --remote
        '';
        inputs = [pkgs.wrangler];
      };

      # Local only: the demo trip the library links to exists in production, so
      # without this the link 404s against a fresh D1. Runs after keeper-migrate.
      keeper-seed = {
        text = ''
          root="$PWD"
          ${inWorker}

          sql="$(mktemp -d)/seed.sql"
          node "$root/scripts/seed-demo-trip.js" > "$sql"
          wrangler d1 execute keeper-of-state --local --file "$sql"
          rm -rf "$(dirname "$sql")"
        '';
        inputs = [pkgs.nodejs pkgs.wrangler];
      };

      # The suite needs an oversize request body to prove the 100 KB limit; it
      # is generated here rather than committed, and --file-root points Hurl at
      # the generated copy.
      keeper-test = {
        text = ''
          fixtures="$(mktemp -d)"
          trap 'rm -rf "$fixtures"' EXIT
          {
            printf '{"filler":"'
            head -c 102400 /dev/zero | tr '\0' 'x'
            printf '"}'
          } > "$fixtures/oversize.json"

          exec hurl --test \
            --file-root "$fixtures" \
            --variable base="''${KEEPER_BASE:-http://localhost:8788}" \
            "$PWD/worker/keeper-of-state/test.hurl"
        '';
        inputs = [pkgs.hurl];
      };

      # Impure by nature: it fetches the IANA database and @vvo/tzdb at run
      # time and writes the result back into the working tree.
      zones = {
        text = ''exec node "$PWD/scripts/build-zone-data.js"'';
        inputs = [pkgs.nodejs];
      };
    };
  in {
    _module.args.scriptNames = lib.attrNames scripts;

    packages =
      lib.mapAttrs (name: script:
        pkgs.writeShellApplication {
          inherit name;
          text = script.text;
          runtimeInputs = script.inputs;
        })
      scripts;
  };
}

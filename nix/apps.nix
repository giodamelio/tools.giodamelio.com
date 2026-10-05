{lib, ...}: {
  perSystem = {
    pkgs,
    config,
    previews,
    ...
  }: let
    accountId = "dd00af6bb2aa48a10ddf29a3a20cf429";

    # giodamelio.com, the zone tools.giodamelio.com is served from.
    zoneId = "0e91800ab04abae0cef614304e109ae2";

    # Wrangler resolves `main` against its config, so it runs in worker/, where
    # the config, the entry point and the migrations already are and where
    # .wrangler/ can be written. Run these from the project root.
    #
    # index.js imports ./tool-routes.js, so relink it here rather than trusting
    # the devShell to have done it: outside `nix develop` the file is missing and
    # wrangler cannot resolve the import, and a shell opened before a tool's
    # routes changed holds a link to an older store path, which would deploy a
    # stale route table without complaining.
    #
    # A tool's preview Worker is linked in the same way, as build/ beside its
    # own wrangler.toml, so wrangler runs it from the store too.
    inWorker = ''
      export CLOUDFLARE_ACCOUNT_ID=${accountId}
      cd worker
      ln -sfn ${config.packages.tool-routes}/tool-routes.js tool-routes.js
      ${lib.concatMapStrings (p: "ln -sfn ${p.worker} ../${p.dir}/build\n") previews}
    '';

    # Every preview Worker's config, for running it beside the main worker.
    previewConfigs = lib.concatMapStringsSep " " (p: "-c ../${p.dir}/wrangler.toml") previews;

    # The main worker's service bindings point at the preview Workers, so they
    # must exist, and be current, before it deploys.
    deployPreviews = lib.concatMapStrings (p: "wrangler deploy -c ../${p.dir}/wrangler.toml\n") previews;

    # The built site, passed rather than linked: it is a build output, and
    # naming it here is what keeps every run serving what the sources say now.
    site = "--assets ${config.packages.site}";

    # One statement, so wrangler prints one table. D1 caps the terms in a
    # compound SELECT, which a VALUES list is exempt from. Only columns from the
    # first migration, so it also reads a database that is behind on migrations.
    statsSql = ''
      WITH live AS (SELECT * FROM blobs WHERE app = 'itinerary' AND deleted_at IS NULL)
      SELECT column1 AS metric, column2 AS value FROM (VALUES
        ('itineraries', (SELECT COUNT(*) FROM live)),
        ('itineraries deleted',
          (SELECT COUNT(*) FROM blobs WHERE app = 'itinerary' AND deleted_at IS NOT NULL)),
        ('created in the last 7 days',
          (SELECT COUNT(*) FROM blobs WHERE app = 'itinerary'
             AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days'))),
        ('edited in the last 7 days',
          (SELECT COUNT(*) FROM live
             WHERE updated_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days'))),
        ('average size (bytes)', (SELECT CAST(AVG(LENGTH(data)) AS INTEGER) FROM live)),
        ('largest (bytes)', (SELECT MAX(LENGTH(data)) FROM live)),
        ('blobs in other apps',
          (SELECT COUNT(*) FROM blobs WHERE app != 'itinerary' AND deleted_at IS NULL)),
        ('owner keys', (SELECT COUNT(*) FROM keys WHERE kind = 'owner')),
        ('temporary keys still live',
          (SELECT COUNT(*) FROM keys WHERE kind = 'temporary' AND revoked_at IS NULL
             AND expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))),
        ('invites minted', (SELECT COUNT(*) FROM keys WHERE kind = 'invite'))
      );
    '';
    # With --json, wrangler reports a failure as an object on stdout rather than
    # the usual array, so pass that through whole instead of formatting it.
    statsFormat = ''
      if type == "array"
      then .[0].results[] | "\(.metric | . + (" " * (30 - length)))\(.value // "-")"
      else "wrangler failed:\n\(.)\n" | halt_error(1)
      end
    '';

    scripts = {
      deploy = {
        text = ''
          ${inWorker}
          ${deployPreviews}
          exec wrangler deploy ${site}
        '';
        inputs = [pkgs.wrangler];
      };

      # Uploads a preview version of the main worker only. Its service bindings
      # reach the preview Workers' deployed versions, so a change to one of
      # those is not visible here until `deploy` ships it.
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
          exec wrangler dev -c wrangler.jsonc ${previewConfigs} ${site} --port 8788 "$@"
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

      keeper-stats = {
        text = ''
          ${inWorker}
          wrangler d1 execute keeper-of-state --local --json --command ${lib.escapeShellArg statsSql} \
            | jq -r ${lib.escapeShellArg statsFormat}
        '';
        inputs = [pkgs.wrangler pkgs.jq];
      };
      keeper-stats-remote = {
        text = ''
          ${inWorker}
          wrangler d1 execute keeper-of-state --remote --json --command ${lib.escapeShellArg statsSql} \
            | jq -r ${lib.escapeShellArg statsFormat}
        '';
        inputs = [pkgs.wrangler pkgs.jq];
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

      # Every preview Worker's Hurl suite, through the main worker at
      # PREVIEW_BASE. The suites read the demo trip, so run keeper-seed first.
      preview-test = {
        text = ''
          exec hurl --test \
            --variable base="''${PREVIEW_BASE:-http://localhost:8788}" \
            ${lib.concatMapStringsSep " " (p: "\"$PWD/${p.dir}/test.hurl\"") previews}
        '';
        inputs = [pkgs.hurl];
      };

      # Impure by nature: it fetches the IANA database and @vvo/tzdb at run
      # time and writes the result back into the working tree.
      zones = {
        text = ''exec node "$PWD/scripts/build-zone-data.js"'';
        inputs = [pkgs.nodejs];
      };

      # Purges Cloudflare's cache, which holds what the main worker put in the
      # Cache API. Needs CF_API_TOKEN, a token with Zone > Cache Purge on the
      # zone; wrangler's own login cannot be granted that scope. Purging
      # everything clears every site on giodamelio.com, so it has to be asked
      # for by name.
      cache-purge = {
        text = ''
          usage() {
            echo "usage: cache-purge <url>...      purge these URLs, exactly as cached" >&2
            echo "       cache-purge --everything  purge the whole giodamelio.com zone" >&2
            exit 2
          }
          [[ $# -gt 0 ]] || usage
          : "''${CF_API_TOKEN:?set CF_API_TOKEN to a token with Zone > Cache Purge}"

          if [[ $1 == --everything ]]; then
            [[ $# -eq 1 ]] || usage
            body='{"purge_everything": true}'
          else
            [[ $1 != -* ]] || usage
            body=$(jq -n '{files: $ARGS.positional}' --args "$@")
          fi

          response=$(curl -sS -X POST \
            "https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache" \
            -H "Authorization: Bearer $CF_API_TOKEN" \
            -H "Content-Type: application/json" \
            --data "$body")

          if [[ $(jq -r '.success' <<<"$response") != true ]]; then
            echo "Cloudflare refused the purge:" >&2
            jq '.errors' <<<"$response" >&2
            exit 1
          fi
          echo "Purged."
        '';
        inputs = [pkgs.curl pkgs.jq];
      };

      # Impure the same way: it fetches OurAirports and writes the itinerary
      # preview's airport-to-city table back into the working tree.
      airports = {
        text = ''exec node "$PWD/scripts/build-airport-data.js"'';
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

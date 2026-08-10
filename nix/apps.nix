{lib, ...}: {
  perSystem = {
    pkgs,
    config,
    ...
  }: let
    accountId = "dd00af6bb2aa48a10ddf29a3a20cf429";

    # Wrangler writes .wrangler/ next to its config, so it cannot run from the
    # read-only store. Sync into a fixed directory rather than a fresh temp one
    # so local D1 state survives between runs.
    syncWorker = ''
      export CLOUDFLARE_ACCOUNT_ID=${accountId}
      worker="''${WORKER_DIR:-$PWD/.worker}"
      mkdir -p "$worker"
      # -rlt rather than -a: the store files are root-owned and read-only, so
      # preserving owner, group and mode would both fail and be useless.
      rsync -rlt --delete --chmod=u+rwX --exclude .wrangler \
        ${config.packages.worker}/ "$worker/"
      cd "$worker"
    '';

    scripts = {
      deploy = {
        text = ''
          ${syncWorker}
          exec wrangler deploy
        '';
        inputs = [pkgs.rsync pkgs.wrangler];
      };

      deploy-preview = {
        text = ''
          ${syncWorker}
          exec wrangler versions upload --preview-alias "''${PREVIEW_ALIAS:-preview}"
        '';
        inputs = [pkgs.rsync pkgs.wrangler];
      };

      serve = {
        text = ''
          ${syncWorker}
          exec wrangler dev --port 8788 "$@"
        '';
        inputs = [pkgs.rsync pkgs.wrangler];
      };

      keeper-migrate = {
        text = ''
          ${syncWorker}
          exec wrangler d1 migrations apply keeper-of-state --local
        '';
        inputs = [pkgs.rsync pkgs.wrangler];
      };

      keeper-migrate-remote = {
        text = ''
          ${syncWorker}
          exec wrangler d1 migrations apply keeper-of-state --remote
        '';
        inputs = [pkgs.rsync pkgs.wrangler];
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

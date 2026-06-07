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
  processes.dev.exec = "wrangler pages dev src --live-reload --port 8788";

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  tasks = {
    "site:publish".exec = "wrangler pages deploy --branch main";
  };

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;
}

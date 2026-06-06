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

{
  pkgs,
  lib,
  config,
  inputs,
  ...
}: {
  packages = with pkgs; [
    wrangler
  ];

  languages.javascript.enable = true;

  # https://devenv.sh/scripts/
  scripts.hello.exec = ''
    echo hello from $GREET
  '';

  tasks = {
    "publish".exec = "true";
  };

  # https://devenv.sh/git-hooks/
  # git-hooks.hooks.shellcheck.enable = true;
}

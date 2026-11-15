#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
run() {
  docker run --rm --user "$(id -u):$(id -g)" --volume "$PWD:/app" --workdir /app composer:2 "$@"
}
case "${1:-}" in
  install) run composer install --no-interaction --prefer-dist ;;
  test) shift; run vendor/bin/phpunit "$@" ;;
  lint) run sh -c 'find lib appinfo templates -name "*.php" -type f -print0 | xargs -0 -n 1 php -l' ;;
  *) echo 'Usage: scripts/php.sh {install|test|lint}' >&2; exit 2 ;;
esac

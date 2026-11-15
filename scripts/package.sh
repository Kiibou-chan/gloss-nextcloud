#!/usr/bin/env bash
set -euo pipefail

# Package committed runtime assets; building and signing are separate operations.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
output=${1:-"$root/build"}
mkdir -p -- "$output"
output=$(cd -- "$output" && pwd)
version=$(sed -n 's/.*<version>\([^<]*\)<\/version>.*/\1/p' "$root/appinfo/info.xml")
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo 'Expected one valid app version in appinfo/info.xml.' >&2
  exit 1
fi

stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
mkdir -- "$stage/gloss"
allowlist=(appinfo lib templates css js/gloss-review.js js/pdf.worker.js LICENSE README.md THIRD-PARTY.md)
# Apply exclusions at every depth, including within allowlisted directories.
excluded=(.local-nc.env .dev-nc.env '.env*' node_modules src tests test .git shots)
exclude_args=()
for path in "${excluded[@]}"; do exclude_args+=("--exclude=$path"); done
tar -C "$root" "${exclude_args[@]}" -cf - -- "${allowlist[@]}" | tar -C "$stage/gloss" -xf -
archive="$output/gloss-$version.tar.gz"
tar -C "$stage" -czf "$archive" -- gloss
printf '%s\n' "$archive"

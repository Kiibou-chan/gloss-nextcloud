#!/usr/bin/env bash
set -euo pipefail

# Package committed runtime assets; building and signing are separate operations.
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
allowlist=(appinfo lib templates css js/gloss-review.js js/pdf.worker.js LICENSE README.md THIRD-PARTY.md)
if [[ -n $(git -C "$root" status --porcelain --untracked-files=all -- "${allowlist[@]}") ]]; then
  echo 'Refusing to package dirty allowlisted runtime paths.' >&2
  exit 1
fi
version=$(git -C "$root" show HEAD:appinfo/info.xml | sed -n 's/.*<version>\([^<]*\)<\/version>.*/\1/p')
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo 'Expected one valid app version in appinfo/info.xml.' >&2
  exit 1
fi
output=${1:-"$root/build"}
mkdir -p -- "$output"
output=$(cd -- "$output" && pwd)
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
# git archive supplies the reviewed bytes and modes, never working-tree backup files.
git -C "$root" archive --format=tar --prefix=gloss/ HEAD -- "${allowlist[@]}" | tar -C "$stage" -xf -
mtime=$(git -C "$root" show -s --format=%ct HEAD)
archive="$output/gloss-$version.tar.gz"
tar -C "$stage" --sort=name --owner=0 --group=0 --numeric-owner --mtime="@$mtime" -czf "$archive" -- gloss
printf '%s\n' "$archive"

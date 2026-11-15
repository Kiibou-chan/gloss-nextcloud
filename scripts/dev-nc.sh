#!/usr/bin/env bash
# Disposable local fixtures only; generated credentials stay in the ignored state file.
# NTFS ignores chmod: copy runtime files into the disposable container there.
# Other filesystems use the plan's read-only repository mount.
# After edits, sync refreshes the NTFS copy; up, url, and shots also sync it.
set -euo pipefail
set +x
umask 077
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"
container=gloss-dev-nc
state="$root/.dev-nc.env"
port=${GLOSS_DEV_NC_PORT:-8090}
case "$port" in ''|0*|*[!0-9]*) echo 'Port must be plain decimal without leading zeros.' >&2; exit 2;; esac
# Bound the length before arithmetic so oversized input cannot wrap into a valid port.
if ((${#port} > 5)) || ((10#$port < 1024 || 10#$port > 65535)); then echo 'Port must be between 1024 and 65535.' >&2; exit 2; fi
if ((10#$port == 8089)); then echo 'Choose a local development port other than 8089.' >&2; exit 2; fi
# This helper never emits credentials, including on failed requests.
state_action() {
node --input-type=module - "$@" <<'JS'
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [action, arg] = process.argv.slice(2);
const path = '.dev-nc.env';
const ownerOnly = mode => (mode & 0o077) === 0;
try {
  if (action === 'init') {
    writeFileSync(path, JSON.stringify({ owner: 'gloss-owner', password: randomBytes(24).toString('hex'), base: `http://127.0.0.1:${arg}`, links: {} }), { mode: 0o600, flag: 'wx' });
  } else {
    if (!ownerOnly(statSync(path).mode)) throw Error();
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (action === 'url') {
      if (!state.links[arg]) throw Error();
      console.log(state.links[arg]);
    } else if (action === 'share') {
      for (const folder of ['Review', 'Plain', 'Long']) {
        const config = `user = "${state.owner}:${state.password}"\n`;
        const result = spawnSync('curl', ['--silent', '--fail', '--config', '-', '-H', 'OCS-APIRequest: true', '-X', 'POST', '--data-urlencode', `path=/${folder}`, '--data', 'shareType=3&permissions=1', `${state.base}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`], { input: config, encoding: 'utf8' });
        if (result.status !== 0) throw Error();
        const answer = JSON.parse(result.stdout).ocs;
        if (answer.meta.statuscode !== 100 && answer.meta.statuscode !== 200) throw Error();
        state.links[folder] = `${state.base}/index.php/apps/gloss/r/${answer.data.token}`;
      }
      writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
    } else throw Error();
  }
  chmodSync(path, 0o600);
  if (!ownerOnly(statSync(path).mode)) throw Error();
} catch { console.error('Development state unavailable or fixture sharing failed; reset the disposable instance.'); process.exitCode = 1; }
JS
}
exists() { docker container inspect "$container" >/dev/null 2>&1; }
owned() {
  local label
  label=$(docker inspect --format '{{index .Config.Labels "gloss.dev.root"}}' "$container")
  if [[ "$label" != "$root" ]]; then echo 'The disposable container belongs to another checkout; refusing to change it.' >&2; exit 1; fi
}
occ() { docker exec -u www-data "$container" php occ "$@"; }
sync_app() {
  exists || { echo 'Start the disposable instance before syncing.' >&2; exit 1; }
  owned
  if [[ $(docker inspect --format '{{index .Config.Labels "gloss.dev.copy"}}' "$container") = true ]]; then
    local paths=(appinfo lib templates css js)
    for path in l10n img; do [[ ! -d "$path" ]] || paths+=("$path"); done
    docker exec "$container" sh -c 'rm -rf /var/www/html/custom_apps/gloss; mkdir -p /var/www/html/custom_apps/gloss'
    tar -cf - --mode='u+rwX,go+rX' "${paths[@]}" | docker exec -i "$container" tar -xf - -C /var/www/html/custom_apps/gloss --no-same-owner
    docker exec "$container" chown -R www-data:www-data /var/www/html/custom_apps/gloss
  fi
}
up() {
  if exists; then
    owned
    docker start "$container" >/dev/null
    sync_app
    occ config:system:set debug --value=true --type=boolean >/dev/null
    state_action url Review >/dev/null
    echo 'Disposable Nextcloud ready.'
    return
  fi
  if [[ -e "$state" ]]; then echo 'Orphaned development state; use reset first.' >&2; exit 1; fi
  git check-ignore -q .dev-nc.env || { echo 'Development state must be gitignored.' >&2; exit 1; }
  local copy=false
  if ! node --input-type=module <<'JS'
import { readdirSync, statSync } from 'node:fs';
function readable(path) {
  const stat = statSync(path);
  if ((stat.mode & 0o004) === 0 || (stat.isDirectory() && (stat.mode & 0o001) === 0)) throw Error();
  if (stat.isDirectory()) for (const entry of readdirSync(path)) readable(`${path}/${entry}`);
}
try {
  if ((statSync('.').mode & 0o005) !== 0o005) throw Error();
  for (const path of ['appinfo', 'lib', 'templates', 'css', 'js']) readable(path);
} catch { process.exitCode = 1; }
JS
  then copy=true; fi
  state_action init "$port"
  mkdir -p build/nc/Long
  node scripts/make-long-draft.mjs build/nc/Long/long.typ
  printf '{}\n' > build/nc/Long/.gloss-review
  local mounts=()
  if [[ "$copy" = false ]]; then mounts=(--mount "type=bind,src=$root,dst=/var/www/html/custom_apps/gloss,readonly"); fi
  docker run -d --name "$container" --label "gloss.dev.root=$root" --label "gloss.dev.copy=$copy" -p "127.0.0.1:$port:80" "${mounts[@]}" nextcloud:33-apache >/dev/null
  local ready=0
  for ((i=0; i<180; i++)); do
    if docker exec "$container" test -f /var/www/html/lib/versioncheck.php && curl --silent --fail "http://127.0.0.1:$port/status.php" >/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" = 1 ]] || { echo 'Nextcloud did not initialise.' >&2; exit 1; }
  # Pass generated fixture state through standard input, never shell arguments or env.
  if ! node --input-type=module >build/nc/install.log 2>&1 <<'JS'
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const php = `$s = json_decode(file_get_contents('php://stdin'), true, 16, JSON_THROW_ON_ERROR);
$_SERVER['argv'] = ['occ', 'maintenance:install', '--database=sqlite', '--admin-user=' . $s['owner'], '--admin-pass=' . $s['password'], '--data-dir=/var/www/html/data'];
$argv = $_SERVER['argv'];
require '/var/www/html/console.php';`;
const result = spawnSync('docker', ['exec', '-i', '-u', 'www-data', 'gloss-dev-nc', 'php', '-r', php], { input: readFileSync('.dev-nc.env'), encoding: 'utf8' });
// Installation diagnostics are private too, in case an upstream error repeats its arguments.
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exitCode = result.status ?? 1;
JS
  then echo 'Disposable installation failed; diagnostic output kept in ignored build/nc/install.log.' >&2; exit 1; fi
  sync_app
  occ config:system:set trusted_domains 1 --value=127.0.0.1 >/dev/null
  occ config:system:set debug --value=true --type=boolean >/dev/null
  occ app:enable gloss >/dev/null
  occ app:enable notifications >/dev/null
  docker cp test/fixtures/nc/Review "$container:/var/www/html/data/gloss-owner/files/Review"
  docker cp test/fixtures/nc/Plain "$container:/var/www/html/data/gloss-owner/files/Plain"
  docker cp build/nc/Long "$container:/var/www/html/data/gloss-owner/files/Long"
  docker exec "$container" chown -R www-data:www-data /var/www/html/data/gloss-owner/files
  occ files:scan --path=gloss-owner/files >/dev/null
  # HTTP startup may follow the completion of the installation.
  for ((i=0; i<60; i++)); do
    if curl --silent --fail "http://127.0.0.1:$port/status.php" >/dev/null; then break; fi
    sleep 1
  done
  state_action share
  echo 'Disposable Nextcloud ready.'
}
down() {
  if exists; then owned; docker rm -fv "$container" >/dev/null; fi
  rm -f -- "$state"
  echo 'Disposable Nextcloud removed.'
}
case "${1:-}" in
  up) up;;
  down) down;;
  reset) down; up;;
  sync) sync_app;;
  url) sync_app; state_action url "${2:-Review}";;
  *) echo 'Usage: scripts/dev-nc.sh up|down|reset|sync|url <folder>' >&2; exit 2;;
esac

# Disposable release checks

Create the disposable instance with `GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset` to install an archive without a repository mount.
If the fixed disposable container belongs to another checkout, `GLOSS_DEV_NC_FORCE_RESET=1` permits removal during `reset` only.
All other commands retain the checkout ownership check.

Run `scripts/dev-nc.sh install-archive <tar.gz>`, then `scripts/dev-nc.sh debug false`.
The archive replaces the entire app directory, ownership is assigned to www-data, and the app is disabled and enabled.
Run `scripts/dev-nc.sh archive-probe` to print the installed bundle and manifest checksums, the app list, and the debug setting.
Compare the checksums with `tar -xOf <tar.gz> gloss/js/gloss-review.js | sha256sum` and the equivalent command for `gloss/appinfo/info.xml`.

Run screenshot commands with `GLOSS_SHOTS_SKIP_SYNC=1` so the archive installation is preserved.
Use `HEAVY_MODE=none /home/kiibou/.cache/gloss-work/tools/heavy-job.sh start <output-folder> <job> -- <command>`, then the helper's `wait <output-folder> <job>` command.
Run scenes sequentially because each theme empties the shared review folder.
The runner writes a result JSON file and captures a screenshot and a safe DOM probe for each failed theme, continues with the other theme, and exits unsuccessfully if either fails.

`password-lapse` creates and deletes its own password-protected public share, retains its generated password only in memory, and photographs the password prompt, saved work, ended session, and recovered backup.
`input-prompts` checks refused typing before a name, keyboard selection without a comment prompt, and pointer selection with one.
`unplaced` removes a synthetic quotation through owner WebDAV, checks the unplaced list, compares the original item's raw JSON bytes after another save, and restores the draft in a finally block.
Use `scripts/dev-nc.sh count-reviews` to report the number of direct files left in `Review reviews` without deleting them.

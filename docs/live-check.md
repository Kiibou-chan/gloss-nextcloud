# Disposable release checks

`$GLOSS_WORK` denotes the workspace containing the checkouts, archive, and shots folders.

Create the disposable instance with `GLOSS_DEV_NC_COPY=1 scripts/dev-nc.sh reset` to install an archive without a repository mount.
If the fixed disposable container belongs to another checkout, `GLOSS_DEV_NC_FORCE_RESET=1` permits removal during `reset` only.
All other commands retain the checkout ownership check.

Run `scripts/dev-nc.sh install-archive <tar.gz>`, then `scripts/dev-nc.sh debug false`.
The archive replaces the entire app directory, ownership is assigned to www-data, and the app is disabled and enabled.
Run `scripts/dev-nc.sh archive-probe` to print the installed bundle and manifest checksums, the app list, and the debug setting.
Compare the checksums with `tar -xOf <tar.gz> gloss/js/gloss-review.js | sha256sum` and the equivalent command for `gloss/appinfo/info.xml`.

`scripts/dev-nc.sh pretty-urls false` saves the current rewrite base, disables the front-controller setting, and regenerates `.htaccess` through occ.
`scripts/dev-nc.sh pretty-urls true` restores the saved rewrite base and regenerates `.htaccess`.
The Docker Apache configuration can still force pretty URLs, so inspect the actual template URL rather than inferring it from the entry link.
The password scene supplies `/index.php/csrftoken` before bundle initialisation when the template instead supplies `/csrftoken`, and asserts a successful refresh through that supplied URL.
Controller tests separately verify forwarding of Nextcloud's generated route.

Run screenshot commands with `GLOSS_SHOTS_SKIP_SYNC=1` so the archive installation is preserved.
Use `HEAVY_MODE=none $GLOSS_WORK/../../tools/heavy-job.sh start <output-folder> <job> -- <command>`, then the helper's `wait <output-folder> <job>` command.
Run scenes sequentially because each theme empties the shared review folder.
The runner writes a result JSON file and captures a screenshot and a safe DOM probe for each failed theme, continues with the other theme, and exits unsuccessfully if either fails.

`password-lapse` creates and deletes its own password-protected public share, retains its generated password only in memory, and photographs the password prompt, saved work in a fresh browser context, stale-token recovery, ended session, and recovered backup.
Authentication submits the actual form without a second navigation to the review link, and asserts that the fragment survives.
`input-prompts` checks refused typing before a name, keyboard selection without a comment prompt, and pointer selection with one.
`unplaced` removes a synthetic quotation through owner WebDAV, checks the unplaced list, compares the original item's raw JSON bytes after another save, and restores the draft in a finally block.
Use `scripts/dev-nc.sh count-reviews` to report the number of direct files left in `Review reviews` without deleting them.

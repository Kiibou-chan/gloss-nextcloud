# gloss for Nextcloud

A Nextcloud app for gloss, an editor for academic writing with an inline comment and review loop.
It will let people review a draft through a share link: they comment on the text and propose changes, and the author sees them in gloss.

In development; nothing to install yet.

Licence: AGPL-3.0-or-later.

## Trying it locally

Spike on branch `spike-review`: a public link to a folder opens a review page at `/apps/gloss/r/<share token>`.
The page shows the folder's draft (first `.typ`, `.tex`, `.md`, or `.txt` file at its top level); Typst is shown readable (headings, emphasis, lists, citations; set rules, comments, labels, and code hidden), other files as plain text.
Comments anchor in the source by the words they quote, with the words before and after, as gloss anchors do.
A reviewer enters a name, selects words, and adds a comment, a new wording, or both.
Each change is saved to `reviews/<name>-<id>.json` in the shared folder, so progress is kept between sittings; Send review marks it sent.
Saving needs a link that allows upload and editing.
With a PDF beside the draft (same base name, or the only PDF in the folder), a PDF view sits beside the Text view.
A selection in the PDF is placed in the source by its letters and digits alone, so line breaks, hyphenation, ligatures, and markup do not stop a match; of several matches, the one nearest the selection's page wins.
The PDF is drawn by pdf.js 3.11.174 (Apache-2.0, `js/vendor/`).

Local Nextcloud 33 in Docker, with this folder mounted as the app:

```bash
docker run -d --name gloss-nc -p 127.0.0.1:8089:80 -e SQLITE_DATABASE=nc -e NEXTCLOUD_ADMIN_USER=admin -e NEXTCLOUD_ADMIN_PASSWORD="$NC_ADMIN_PASSWORD" -e NEXTCLOUD_TRUSTED_DOMAINS="127.0.0.1 localhost" -v "$PWD":/var/www/html/custom_apps/gloss:ro nextcloud:33-apache
docker exec -u www-data gloss-nc php occ app:enable gloss
```

Test credentials live in `.local-nc.env` (untracked).
Bump `<version>` in `appinfo/info.xml` and run `occ upgrade` after changing CSS or JS, or Nextcloud serves the cached files.

# Hosting the privacy policy

Chrome Web Store requires a **public HTTPS URL** to `privacy.html`.

## GitHub Pages

1. Ensure this file is available on a **public** branch (main repo public, or a small public repo with only `docs/`).
2. Repository **Settings → Pages**.
3. Source: **Deploy from a branch** → branch `main` (or `master`) → folder **`/docs`**.
4. Save. After deploy, open: `https://<github-username>.github.io/<repo-name>/privacy.html`
5. Use that URL in the Chrome Web Store **Privacy policy** field.

## Google Sites (no GitHub)

1. Create a new Google Site.
2. Copy the text from `privacy.html` into a page (or embed via HTML box if available).
3. Publish the site and use the public page URL in the dashboard.

## Private main repo

If `cluelessno1/babeltube` stays private, create a separate public repository (e.g. `babeltube-privacy`) containing only `docs/privacy.html`, enable Pages on `/docs`, and use that URL.

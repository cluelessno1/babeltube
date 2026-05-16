#!/usr/bin/env bash
# Build a Chrome Web Store upload ZIP (files at archive root, no .git).
# Output: babeltube-v{version}.zip (version read from manifest.json).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
staging="${TMPDIR:-/tmp}/babeltube-store"
manifest="$repo_root/manifest.json"

version="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$manifest")"
if [[ -z "$version" ]]; then
  echo "manifest.json has no version field" >&2
  exit 1
fi

out_zip="$repo_root/babeltube-v${version}.zip"

includes=(
  manifest.json
  background.js
  content_scripts
  popup
  options
  icons
)

rm -rf "$staging"
mkdir -p "$staging"

for item in "${includes[@]}"; do
  src="$repo_root/$item"
  if [[ ! -e "$src" ]]; then
    echo "Missing required path: $src" >&2
    exit 1
  fi
  cp -R "$src" "$staging/"
done

rm -f "$out_zip"
(
  cd "$staging"
  zip -r "$out_zip" .
)

echo "Created: $out_zip (manifest version $version)"
echo "Staging folder (for Load unpacked test): $staging"

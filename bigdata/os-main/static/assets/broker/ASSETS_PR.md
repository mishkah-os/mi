# Broker media PR workflow

To keep broker media binaries separate from code/config changes, split your work into two pull requests:

## 1) Assets-only PR
- Branch from the current `work` head: `git switch -c broker-assets-only`.
- Add or update **only** files under `static/assets/broker/*`.
- Do **not** include `.gitattributes`, JSON, or code changes in this branch.
- Commit and open a PR titled **"Add broker media assets (assets-only)"**.

## 2) Code/config PR
- Return to the code branch (e.g., `work`).
- Ensure no media binaries are staged: `git restore static/assets/broker/*`.
- Keep only `.gitattributes` and code/config changes in the diff.
- Commit and open a PR that excludes all `*.png`, `*.jpg`, `*.jpeg`, `*.webp`, and `*.svg` files.

## Quick checklist
- [ ] Assets branch contains only `static/assets/broker/*` media files.
- [ ] Code branch contains zero broker media binaries.
- [ ] `.gitattributes` stays on the code branch to keep binary diffs clean.

# After a container restore (when `.git/` is missing)

Run from /app/applet. Re-attaches history only; the working tree is not modified.

    git init -q -b main
    git config user.name  "spoton-dev"
    git config user.email "spoton-dev@local"
    git fetch -q verification/snapshots/spoton.bundle main
    git update-ref refs/heads/main FETCH_HEAD
    git reset -q                     # index = bundle HEAD; working tree untouched
    git log --oneline -1
    git status --short               # = everything changed since the last bundle

After every commit:

    git bundle create verification/snapshots/spoton.bundle --all

The bundle is NOT git-ignored and NOT tracked: ignored paths do not survive hibernation (observed 2026-10-26: .git/, node_modules/ and the ignored bundle were all dropped; non-ignored files survived). It shows as `??` permanently. Always stage with:

    git add -A -- . ":!verification/snapshots/spoton.bundle"
verification/snapshots/** is `-text` in .gitattributes so snapshots are stored byte-exact (no CRLF/LF conversion).

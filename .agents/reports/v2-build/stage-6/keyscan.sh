#!/bin/sh
# Look for token-shaped strings. Prints only file:line, never the value.
cd /home/sprime01/projects/Horizon
pat='(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gho_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[bpas]-[A-Za-z0-9-]{10,})'
echo "tracked files: $(git grep -nIE "$pat" | wc -l) matches"; git grep -nIE "$pat" | cut -d: -f1,2 | head -20
echo "lines added on this branch since main: $(git log -p main..HEAD | grep -E '^\+' | grep -cE "$pat") matches"
echo "reports and seed data: $(grep -rnIE "$pat" .agents/reports/v2-build scripts/seed-data 2>/dev/null | wc -l) matches"
echo "secret-named files tracked: $(git ls-files | grep -ciE '\.secret$|\.pem$|\.key$|credentials|(^|/)\.env$')"

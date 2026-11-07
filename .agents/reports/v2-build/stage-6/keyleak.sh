#!/bin/sh
# K12: search for the real workshop key's first 12 characters. The key is read into a variable and never printed.
K=$(head -c 12 /home/sprime01/.horizon/setups/testing/secrets/workbench.key)
[ ${#K} -eq 12 ] || { echo "no key"; exit 2; }
T=/home/sprime01/.horizon/setups/testing
S=/tmp/claude-1000/-home-sprime01-projects-Horizon/153d70cd-d7e5-4657-8444-9a0c48bbc206/scratchpad
for place in "$T/cell" "$T/exports" "$T/run" "$T/cache" "$T/workbench" "$S" /home/sprime01/projects/Horizon/.agents/reports "/home/sprime01/projects/Horizon/src" ; do
  n=$(grep -rlaF -- "$K" "$place" 2>/dev/null | grep -v "/secrets/" | wc -l); echo "$place: $n files"
done

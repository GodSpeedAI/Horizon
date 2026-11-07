#!/bin/sh
# Final key scan. Each key's first 12 characters are read into a variable and never printed.
# Keys: the workshop access key, and the OpenCode and ClinePass keys from the OpenCode sign-in file.
T=/home/sprime01/.horizon/setups/testing
S=/tmp/claude-1000/-home-sprime01-projects-Horizon/153d70cd-d7e5-4657-8444-9a0c48bbc206/scratchpad
WB=$(head -c 12 $T/secrets/workbench.key)
OC=$(bun -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.local/share/opencode/auth.json","utf8")).opencode?.key??"").slice(0,12))')
CP=$(bun -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.env.HOME+"/.local/share/opencode/auth.json","utf8"))["cline-pass"]?.key??"").slice(0,12))')
for name in workshop opencode clinepass; do
  case $name in workshop) K=$WB;; opencode) K=$OC;; clinepass) K=$CP;; esac
  [ ${#K} -eq 12 ] || { echo "$name: no key to look for"; continue; }
  for place in "$T/cell" "$T/exports" "$T/run" "$T/cache" "$T/workbench" "$S" /home/sprime01/projects/Horizon/.agents/reports /home/sprime01/projects/Horizon/src /home/sprime01/projects/Horizon/dist /home/sprime01/projects/Horizon/scripts /home/sprime01/projects/Horizon/test; do
    n=$(grep -rlaF -- "$K" "$place" 2>/dev/null | grep -v "/secrets/" | wc -l); echo "$name in $place: $n files"
  done
  n=$(git -C /home/sprime01/projects/Horizon log -p --all 2>/dev/null | grep -caF -- "$K"); echo "$name in Horizon git history: $n lines"
done

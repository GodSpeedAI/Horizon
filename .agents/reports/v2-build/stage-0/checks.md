# Stage 0 named checks

## Project scope
`gh auth status 2>&1 | grep -c "'project'"`
```
1
```
## Sandbox repository
```
{"name":"horizon-sandbox"}
```
## Sub-issues and Board
`bun run scripts/setup-github.ts --setup testing`
```
project scope: present
repository: GodSpeedAI/horizon-sandbox
board: Horizon testing (#2)
sub-issues: true
wrote /home/sprime01/.horizon/setups/testing/github.json
exit=0
```
`github.json`:
```
{
  "repo": "GodSpeedAI/horizon-sandbox",
  "projectNumber": 2,
  "subIssues": true
}
```
## Records health
```
ok   records: every record source answers repo list (personal, workshop, horizon)
exit=0
```

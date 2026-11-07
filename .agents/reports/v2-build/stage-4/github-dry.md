# GitHub connector dry run

Issue: https://github.com/GodSpeedAI/horizon-sandbox/issues/3

Dry mode: the mapping function ran once on the live issue (read through the operator's gh login). Nothing was sent to the case keeper.

case_add_item frame it would send (case id is a placeholder; the connector picks the newest open case or github.json caseId):

```json
{
  "verb": "case_add_item",
  "case_id": "<case_id of the open case>",
  "item": {
    "plan_item_id": "gh_GodSpeedAI_horizon_sandbox_3",
    "name": "Horizon connector dry check",
    "item_kind": "human_task",
    "settlement_criteria": {
      "required_artifacts": [],
      "required_declarations": [],
      "require_approval": true
    },
    "external_ref": {
      "kind": "github_issue",
      "id": "GodSpeedAI/horizon-sandbox#3",
      "url": "https://github.com/GodSpeedAI/horizon-sandbox/issues/3"
    }
  },
  "policy": "policy.yaml",
  "request_id": "github:GodSpeedAI/horizon-sandbox#3",
  "actor": {
    "actor_id": "cognate-service",
    "role": "service"
  }
}
```

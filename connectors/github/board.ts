/**
 * One GitHub Projects v2 board per organization, with two text fields: Case and State. Every call is idempotent:
 * it looks first, creates only what is missing, and setting a field to the value it has is harmless.
 */
import type { GhClient } from "./gh.ts";
import { GhError } from "./gh.ts";

export interface Board {
  readonly projectId: string;
  readonly caseField: string;
  readonly stateField: string;
}

const LIST = `query ListBoards($org: String!) { organization(login: $org) { id projectsV2(first: 50) { nodes { id title fields(first: 40) { nodes { ... on ProjectV2FieldCommon { id name } } } } } } }`;
const CREATE_BOARD = `mutation CreateBoard($owner: ID!, $title: String!) { createProjectV2(input: { ownerId: $owner, title: $title }) { projectV2 { id title } } }`;
const CREATE_FIELD = `mutation CreateField($project: ID!, $name: String!) { createProjectV2Field(input: { projectId: $project, dataType: TEXT, name: $name }) { projectV2Field { ... on ProjectV2Field { id name } } } }`;
const ADD_ITEM = `mutation AddItem($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`;
const SET_VALUE = `mutation SetValue($project: ID!, $item: ID!, $field: ID!, $text: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { text: $text } }) { projectV2Item { id } } }`;

export async function ensureBoard(gh: GhClient, org: string, title: string): Promise<Board> {
  const data = await gh.graphql(LIST, { org });
  const organization = data?.organization;
  if (!organization?.id) throw new GhError("not_found", `GitHub has no organization "${org}" visible to this sign-in, so the board cannot be made.`);
  const nodes: any[] = organization.projectsV2?.nodes ?? [];
  let board = nodes.find((p) => p?.title === title);
  if (!board) {
    const made = await gh.graphql(CREATE_BOARD, { owner: organization.id, title });
    board = { ...made?.createProjectV2?.projectV2, fields: { nodes: [] } };
  }
  if (!board?.id) throw new GhError("garbled", "GitHub answered the board request in a way Horizon could not read. Nothing was changed.");
  const fields: { id: string; name: string }[] = (board.fields?.nodes ?? []).filter((f: any) => f?.id && f?.name);
  const field = async (name: string): Promise<string> => {
    const known = fields.find((f) => f.name === name);
    if (known) return known.id;
    const made = await gh.graphql(CREATE_FIELD, { project: board.id, name });
    const id = made?.createProjectV2Field?.projectV2Field?.id;
    if (typeof id !== "string") throw new GhError("garbled", "GitHub answered the board request in a way Horizon could not read. Nothing was changed.");
    return id;
  };
  return { projectId: board.id, caseField: await field("Case"), stateField: await field("State") };
}

/** Put an issue on the board (once) and set its Case and State. */
export async function placeIssue(gh: GhClient, board: Board, issueNodeId: string, values: { readonly case: string; readonly state: string }): Promise<void> {
  const added = await gh.graphql(ADD_ITEM, { project: board.projectId, content: issueNodeId });
  const item = added?.addProjectV2ItemById?.item?.id;
  if (typeof item !== "string") throw new GhError("garbled", "GitHub answered the board request in a way Horizon could not read. Nothing was changed.");
  await gh.graphql(SET_VALUE, { project: board.projectId, item, field: board.caseField, text: values.case });
  await gh.graphql(SET_VALUE, { project: board.projectId, item, field: board.stateField, text: values.state });
}

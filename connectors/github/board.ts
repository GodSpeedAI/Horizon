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

const LIST = `query ListBoards($org: String!, $after: String) { organization(login: $org) { id projectsV2(first: 50, after: $after) { nodes { id title fields(first: 100) { nodes { ... on ProjectV2FieldCommon { id name } } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } } }`;
const FIELDS = `query Fields($id: ID!, $after: String) { node(id: $id) { ... on ProjectV2 { fields(first: 100, after: $after) { nodes { ... on ProjectV2FieldCommon { id name } } pageInfo { hasNextPage endCursor } } } } }`;
const MAX_PAGES = 100;
const CREATE_BOARD = `mutation CreateBoard($owner: ID!, $title: String!) { createProjectV2(input: { ownerId: $owner, title: $title }) { projectV2 { id title } } }`;
const CREATE_FIELD = `mutation CreateField($project: ID!, $name: String!) { createProjectV2Field(input: { projectId: $project, dataType: TEXT, name: $name }) { projectV2Field { ... on ProjectV2Field { id name } } } }`;
const ADD_ITEM = `mutation AddItem($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`;
const SET_VALUE = `mutation SetValue($project: ID!, $item: ID!, $field: ID!, $text: String!) { updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { text: $text } }) { projectV2Item { id } } }`;

export async function ensureBoard(gh: GhClient, org: string, title: string): Promise<Board> {
  let organizationId: string | undefined;
  let board: any;
  let after: string | null = null;
  // Look through every page before deciding the board is absent: "not on the first page" is not "not there".
  for (let page = 0; page < MAX_PAGES && !board; page += 1) {
    const data: any = await gh.graphql(LIST, { org, after });
    const organization = data?.organization;
    if (!organization?.id) throw new GhError("not_found", `GitHub has no organization "${org}" visible to this sign-in, so the board cannot be made.`);
    organizationId = organization.id;
    board = (organization.projectsV2?.nodes ?? []).find((p: any) => p?.title === title);
    const info = organization.projectsV2?.pageInfo;
    if (board || !info?.hasNextPage) break;
    after = info.endCursor;
    if (page === MAX_PAGES - 1) throw new GhError("too_large", `The organization has more than ${MAX_PAGES * 50} boards, more than Horizon reads, so it did not make a new one.`);
  }
  if (!board) {
    const made = await gh.graphql(CREATE_BOARD, { owner: organizationId, title });
    board = { ...made?.createProjectV2?.projectV2, fields: { nodes: [] } };
  }
  if (!board?.id) throw new GhError("garbled", "GitHub answered the board request in a way Horizon could not read. Nothing was changed.");
  const fields: { id: string; name: string }[] = (board.fields?.nodes ?? []).filter((f: any) => f?.id && f?.name);
  let info = board.fields?.pageInfo;
  for (let page = 0; info?.hasNextPage && page < MAX_PAGES; page += 1) {
    const more: any = await gh.graphql(FIELDS, { id: board.id, after: info.endCursor });
    fields.push(...(more?.node?.fields?.nodes ?? []).filter((f: any) => f?.id && f?.name));
    info = more?.node?.fields?.pageInfo;
  }
  if (info?.hasNextPage) throw new GhError("too_large", "The board has more fields than Horizon reads, so it did not add any.");
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

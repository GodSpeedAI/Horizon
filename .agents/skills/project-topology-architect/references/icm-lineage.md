# ICM lineage and attribution

Project Topology Architect was refounded from the **icm-architect** skill and its cited
methodology. ICM Architect is lineage, not the governing ontology of this plugin. Its
source material is preserved for reference and attribution; the active rules live in the
primary skill ([SKILL.md](../SKILL.md)) and its references.

## Attribution

- **Interpretable Context Methodology (ICM)** — method by **Jake Van Clief** and
  McDermott, paper **"Interpretable Context Methodology: Folder Structure as Agent
  Architecture," arXiv:2603.16021**.
- The original `icm-architect` skill was **MIT licensed** and carried Jake Van Clief's
  copyright notice. That license governs the preserved lineage material below.
- This repository is distributed under **Apache-2.0** (see root `LICENSE`). Bundled
  skills (`neatcode`, `domainforge-sea`, `deriving-interaction-domain-models`) are
  distributed under this plugin's license unless a skill declares its own.
- The legacy ICM method statement, its reference cards, and its copyable templates are
  preserved verbatim under
  `assets/lineage/icm/` (with MIT attribution preserved), for anyone who wants the
  original method intact. The active plugin deliberately **does not** import its
  governing ontology.

## What the refoundation preserves (generalized into active principles)

| ICM idea | Active form in Project Topology Architect |
|----------|-------------------------------------------|
| Small stable entry/routing surface | Concise root `AGENTS.md` + `just --list`; small stable routing surfaces |
| One home per fact | Same invariant: link over copy, everywhere |
| Links/pointers instead of duplicated truth | Same |
| Context locality ("load only what the step needs") | Narrow-load substrates; task-scoped gates and bounded proof commands |
| Explicit structural responsibility | Explicit subsystem responsibility, dependency direction, contract ownership |
| Minimum sufficient structure | Same |
| Factory/product separation | Durable reference separated from transient work state |
| Cold-agent "walk test" | Generalizes into cold-agent topology evaluation ([cold-agent-evaluation](cold-agent-evaluation.md)) with measured navigation burden |
| Structure derives from actual work | Same discipline: derive topology from work, not imposed templates |
| Human-readable/editable artifacts where valuable | Kept where human editing is valuable; structured config/tooling where it is not |

## What is deliberately retired as governing ontology

- numbered folders as the default architecture;
- a `CONTEXT.md` in every folder;
- Markdown as the state machine;
- human approval after every stage as a universal requirement;
- a sequential pipeline ontology as the default shape;
- the six ICM workspace forms (pipeline, umbrella, record library, knowledge bundle,
  context map, system map) as the governing classification system;
- Claude-specific `CLAUDE.md` as the default instruction surface (now root `AGENTS.md`);
- Markdown where TOML/YAML/JSON or executable tooling is more appropriate.

These are not "wrong"; they are specialized shapes that over-gov a project-topology
compiler. Their read/write rules remain in the preserved lineage material for reuse on
workspace-shaped problems.

## What was migrated

- System-map audit ideas → generalized into the brownfield audit procedure
  ([brownfield-restructuring](brownfield-restructuring.md));
- Walk test → cold-agent topology evaluation;
- Template starters (`assets/lineage/icm/templates/`) preserved for lineage, not used as
  the scaffold source for generated projects.

## Why attribution stays clean

Lineage lives here and in `assets/lineage/icm/`, so the active ontology names its own
concepts (topology, freeze envelope, verification graph, substrate, workbench) without
dragging in obsolete ICM terminology merely to preserve credit.
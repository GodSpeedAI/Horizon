# Stage 1 cleanup list

Empty folders found with `find ... -type d -empty` outside `node_modules`, `.git`, `.cognate`:

| Path | Reason |
| --- | --- |
| `.serena/memories` | Tool state folder of the Serena assistant, not Horizon source. Left in place. |
| `.serena/cache/python` | Same. Left in place. |

Stale version notes: `src/adapters/EGM.md` listed three read-only commands; updated to four (`ledger verify`). The `EconomicsConfig` comment in `src/config/types.ts` updated likewise. No other stale notes found.

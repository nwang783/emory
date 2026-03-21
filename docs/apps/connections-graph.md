# Connections graph (desktop)

## Where logic lives

| Concern | Location |
|--------|----------|
| Graph canvas (layout, draw, pan/zoom) | `apps/desktop/src/renderer/modules/connections/components/ConnectionsGraph.tsx` |
| Edit person / per-edge type, notes, delete edge, delete person | `apps/desktop/src/renderer/modules/connections/components/GraphNodeEditDialog.tsx` |
| Relationship type list + edge colours | `apps/desktop/src/renderer/modules/connections/lib/graph-constants.ts` |
| Deriving “edge from self → person” for UI outside the graph | `apps/desktop/src/renderer/shared/lib/graph-relationship-labels.ts` |
| SQLite: `relationships` CRUD | `packages/db/src/repositories/relationship.repository.ts` |
| IPC registration + memory sync on create/update/delete | `apps/desktop/src/main/ipc/db.ipc.ts` |
| Upsert/delete `person_memories` rows tied to graph edges | `apps/desktop/src/main/services/relationship-memory-sync.service.ts`, `packages/db/src/repositories/conversation.repository.ts` |

## Authoritative data

- **Relationship type and notes** for “how you know someone” live on **`relationships`** (one row per pair), not on `people.relationship` / `people.notes`.
- The desktop UI no longer edits `people.relationship` or `people.notes` from Camera or People modals; those columns may still exist for legacy rows or programmatic use.
- When an edge touches the designated **self** person, main process **`syncGraphRelationshipToMemory`** keeps a linked **`person_memories`** row (`memory_type = relationship`, `relationship_id` set) in sync for memory query and Memory Browser.

## User actions

- **Add**: “Add” opens the existing dialog (You → other person, type, optional notes).
- **Edit**: **Double-click** a node to open the graph editor — change name, per-connection type/notes (**Apply** per edge), **Remove edge**, or **Delete person** (non–self only). Deleting a person relies on SQLite `ON DELETE CASCADE` for embeddings, edges, and linked memories.
- After graph mutations, **`loadPeople()`** refreshes `graphEdgeToSelfByPersonId` in `people.store.ts` so Camera, People badges, and analytics stay aligned.

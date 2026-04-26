import { openDB } from 'idb'
import type { EventMeta } from './events'

const DB_NAME = 'babytracker'
const DB_VERSION = 1
const STORE = 'pending_events'

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'id' })
    },
  })
}

export interface PendingEvent {
  id: string
  type: string
  timestamp: string
  metadata: EventMeta
}

export async function addPending(event: PendingEvent): Promise<void> {
  const db = await getDB()
  await db.put(STORE, event)
}

export async function removePending(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function getAllPending(): Promise<PendingEvent[]> {
  const db = await getDB()
  return db.getAll(STORE)
}

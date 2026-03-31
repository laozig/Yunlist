import { getDB } from '../db';

export interface TrashEntry {
  id: string;
  original_path: string;
  trash_path: string;
  item_name: string;
  is_directory: boolean;
  size: number;
  deleted_at?: string;
  meta_snapshot?: string | null;
  event_snapshot?: string | null;
}

function mapTrashRow(row: any): TrashEntry | undefined {
  if (!row) return undefined;

  return {
    ...row,
    is_directory: row.is_directory === 1,
    size: Number(row.size ?? 0),
  } as TrashEntry;
}

export const TrashEntryModel = {
  create: async (entry: TrashEntry) => {
    const db = getDB();
    return await db.run(`
      INSERT INTO trash_entries (
        id, original_path, trash_path, item_name, is_directory, size, deleted_at, meta_snapshot, event_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `, [
      entry.id,
      entry.original_path,
      entry.trash_path,
      entry.item_name,
      entry.is_directory ? 1 : 0,
      entry.size ?? 0,
      entry.meta_snapshot ?? null,
      entry.event_snapshot ?? null,
    ]);
  },

  listAll: async (): Promise<TrashEntry[]> => {
    const db = getDB();
    const rows = await db.all('SELECT * FROM trash_entries ORDER BY deleted_at DESC');
    return rows.map(mapTrashRow).filter((row): row is TrashEntry => !!row);
  },

  findById: async (id: string): Promise<TrashEntry | undefined> => {
    const db = getDB();
    const row = await db.get('SELECT * FROM trash_entries WHERE id = ?', [id]);
    return mapTrashRow(row);
  },

  deleteById: async (id: string) => {
    const db = getDB();
    return await db.run('DELETE FROM trash_entries WHERE id = ?', [id]);
  }
};
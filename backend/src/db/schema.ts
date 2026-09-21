import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDatabase(filename: string) {
  mkdirSync(dirname(filename), { recursive: true })
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  const version = db.pragma('user_version', { simple: true }) as number
  if (version > 1) throw new Error('Unsupported DB version: ' + version)
  if (version === 0) db.transaction(() => {
    db.exec(`
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE maps (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE assets (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE categories (id TEXT PRIMARY KEY, icon_id TEXT REFERENCES assets(id), payload TEXT NOT NULL);
      CREATE TABLE waypoints (
        game_id TEXT NOT NULL CHECK(game_id='gta-v'), map_id TEXT NOT NULL REFERENCES maps(id),
        id TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id),
        payload TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(game_id,map_id,id)
      );
      CREATE TABLE waypoint_images (
        game_id TEXT NOT NULL, map_id TEXT NOT NULL, waypoint_id TEXT NOT NULL,
        asset_id TEXT NOT NULL REFERENCES assets(id), position INTEGER NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY(game_id,map_id,waypoint_id,position),
        FOREIGN KEY(game_id,map_id,waypoint_id) REFERENCES waypoints(game_id,map_id,id)
      );
      CREATE TABLE progress (
        game_id TEXT NOT NULL, map_id TEXT NOT NULL, waypoint_id TEXT NOT NULL,
        found INTEGER NOT NULL CHECK(found IN (0,1)), updated_at TEXT NOT NULL,
        PRIMARY KEY(game_id,map_id,waypoint_id),
        FOREIGN KEY(game_id,map_id,waypoint_id) REFERENCES waypoints(game_id,map_id,id)
      );
      CREATE TABLE tiles (map_id TEXT NOT NULL REFERENCES maps(id), z INTEGER NOT NULL, x INTEGER NOT NULL,
        y INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(map_id,z,x,y));
      PRAGMA user_version = 1;
    `)
  })()
  return db
}

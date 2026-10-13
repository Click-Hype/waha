//
// Presence
//

//
// Local - SQLite engine
//
// NooviCrew ships only better-sqlite3 (its bundled SQLite is kept patched); the
// `sqlite3` package was removed, so WAHA_SQLITE_ENGINE=sqlite3 is refused at boot.
if (
  process.env.WAHA_SQLITE_ENGINE &&
  process.env.WAHA_SQLITE_ENGINE != 'better-sqlite3'
) {
  throw new Error('WAHA_SQLITE_ENGINE must be better-sqlite3 in this build');
}
const KNEX_SQLITE_CLIENT = 'better-sqlite3';
export { KNEX_SQLITE_CLIENT };

//
// Client config
//
export const WAHA_CLIENT_DEVICE_NAME =
  process.env.WAHA_CLIENT_DEVICE_NAME || null;
export const WAHA_CLIENT_BROWSER_NAME =
  process.env.WAHA_CLIENT_BROWSER_NAME || null;

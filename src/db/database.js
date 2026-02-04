import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db = null;

export const initDB = async () => {
  try {
    // Create a connection
    const ret = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection("temple_db", false)).result;
    
    if (ret.result && isConn) {
      db = await sqlite.retrieveConnection("temple_db", false);
    } else {
      db = await sqlite.createConnection("temple_db", false, "no-encryption", 1);
    }

    await db.open();

    // ⚠️ CRITICAL UPDATE: Added 'phone' column to the schema here
    const schema = `
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        donor_name TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        denomination INTEGER,
        sl_no TEXT,
        receipt_no TEXT,
        phone TEXT
      );
    `;

    await db.execute(schema);
    
    // --- MIGRATION SAFETY CHECK ---
    // If the user didn't uninstall, this adds the column manually to prevent crashes
    try {
      await db.execute("ALTER TABLE donations ADD COLUMN phone TEXT;");
    } catch (e) {
      // Ignore error if column already exists
    }

    console.log("Database Initialized with Phone Column");

  } catch (err) {
    console.error("DB Init Error:", err);
  }
};

export const getDB = async () => {
  if (!db) await initDB();
  return db;
};

export const getAllDonations = async () => {
  const db = await getDB();
  // We order by ID DESC so newest entries show first
  const res = await db.query("SELECT * FROM donations ORDER BY id DESC");
  return res.values || [];
};

export const deleteDonation = async (id) => {
  const db = await getDB();
  await db.run("DELETE FROM donations WHERE id = ?", [id]);
};
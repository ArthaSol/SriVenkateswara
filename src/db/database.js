import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const sqlite = new SQLiteConnection(CapacitorSQLite);
let db = null;

export const initDB = async () => {
  try {
    const ret = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection("temple_db", false)).result;
    
    if (ret.result && isConn) {
      db = await sqlite.retrieveConnection("temple_db", false);
    } else {
      db = await sqlite.createConnection("temple_db", false, "no-encryption", 1);
    }

    await db.open();

    // ⚠️ ALIGNED SCHEMA: Added uuid, sync_status, and last_updated
    const schema = `
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE,
        date TEXT NOT NULL,
        donor_name TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        denomination INTEGER,
        sl_no TEXT,
        receipt_no TEXT,
        phone TEXT,
        sync_status TEXT DEFAULT 'pending',
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await db.execute(schema);
    
    // --- MIGRATION SAFETY CHECK ---
    const migrations = [
      "ALTER TABLE donations ADD COLUMN phone TEXT;",
      "ALTER TABLE donations ADD COLUMN uuid TEXT UNIQUE;",
      "ALTER TABLE donations ADD COLUMN sync_status TEXT DEFAULT 'pending';",
      "ALTER TABLE donations ADD COLUMN last_updated DATETIME DEFAULT CURRENT_TIMESTAMP;"
    ];

    for (let query of migrations) {
        try { await db.execute(query); } catch (e) { /* Ignore if exists */ }
    }

    console.log("Database Initialized: Ready for Supabase Cloud Sync");

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
  // 👈 CHANGED: Sorts by Calendar Date first, then by newest inserted
  const res = await db.query("SELECT * FROM donations ORDER BY date DESC, id DESC"); 
  return res.values || [];
};

export const deleteDonation = async (id) => {
  const db = await getDB();
  await db.run("DELETE FROM donations WHERE id = ?", [id]);
};

// NEW: Safely inserts cloud records, translating Supabase columns to SQLite columns
export const insertCloudDonations = async (cloudRecords) => {
  const db = await getDB();
  let insertedCount = 0;
  
  // Safety net just in case a row is truly empty
  const fallbackDate = new Date().toISOString().slice(0, 10);

  for (const record of cloudRecords) {
    // 1. Check if we already have this exact receipt locally
    const check = await db.query("SELECT id FROM donations WHERE uuid = ?", [record.uuid]);
    
    // 2. Translate and Insert safely
    if (!check.values || check.values.length === 0) {
      await db.run(
        `INSERT INTO donations (uuid, date, donor_name, amount, type, denomination, sl_no, receipt_no, phone, sync_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.uuid, 
          record.donation_date || record.date || fallbackDate, // 👈 Catches Cloud 'donation_date'
          record.narration || record.donor_name || "Unknown",  // 👈 Catches Cloud 'narration'
          record.amount || 0, 
          record.type || 'CREDIT',
          record.book_type || record.denomination || record.amount || 0, // 👈 Catches Cloud 'book_type'
          record.sl_no || "",                       
          record.receipt_no || "", 
          record.phone || "",                       
          'synced' 
        ]
      );
      insertedCount++;
    }
  }
  return insertedCount; 
};
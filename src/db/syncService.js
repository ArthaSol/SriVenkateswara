// src/db/syncService.js
import { getDB } from './database';
import { supabase } from './supabaseClient';

export const syncPendingDonations = async () => {
  try {
    // 1. If phone has no internet, silently stop and try again later
    if (!navigator.onLine) return;

    const db = await getDB();
    
    // 2. Ask SQLite for only the rows that haven't been backed up yet
    const res = await db.query("SELECT * FROM donations WHERE sync_status = 'pending'");
    const pendingRecords = res.values || [];

    if (pendingRecords.length === 0) return; // Nothing to sync!

    console.log(`Found ${pendingRecords.length} offline records. Syncing to Supabase...`);

// 3. Prepare the exact format Supabase expects
    const payload = pendingRecords.map(record => ({
      uuid: record.uuid,
      donation_date: record.date,              // Fixed to read 'date'
      book_type: record.denomination,          // Fixed to read 'denomination'
      amount: record.amount,
      narration: record.donor_name,            // Fixed to read 'donor_name'
      receipt_no: record.receipt_no || null,
      sl_no: record.sl_no || null,
      phone: record.phone || null
    }));

    // 4. Push to Cloud (Upsert prevents duplicates automatically)
    const { error } = await supabase.from('donations').upsert(payload);

    if (error) {
      console.error("Supabase rejection:", error);
      return;
    }

    // 5. Cloud accepted the data! Tell local SQLite to mark them as 'synced'
    for (let record of pendingRecords) {
        await db.run("UPDATE donations SET sync_status = 'synced' WHERE id = ?", [record.id]);
    }

    console.log("Sync complete! Data is safe in the cloud.");

  } catch (err) {
    console.error("Background Sync Error:", err);
  }
};
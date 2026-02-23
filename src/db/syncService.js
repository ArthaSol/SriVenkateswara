// src/db/syncService.js
import { getDB, insertCloudDonations } from './database';
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

// NEW: The 1-Click Cloud Recovery Engine (with pagination for large databases)
export const restoreFromCloud = async () => {
  if (!navigator.onLine) {
    return { success: false, message: "No Internet. Please connect to Wi-Fi or Mobile Data." };
  }

  try {
    let allCloudData = [];
    let keepFetching = true;
    let start = 0;
    const step = 999; // Supabase safe limit per request

    // Loop to grab every single record, no matter how large the database gets
    while (keepFetching) {
      const { data, error } = await supabase
        .from('donations')
        .select('*')
        .range(start, start + step);

      if (error) throw error;

      if (data && data.length > 0) {
        allCloudData = [...allCloudData, ...data];
        start += step + 1;
      } else {
        keepFetching = false; // Reached the end of the cloud database
      }
    }

    if (allCloudData.length === 0) {
      return { success: true, count: 0, message: "Cloud database is currently empty." };
    }

    // Send the massive list to our safe local DB function
    const insertedCount = await insertCloudDonations(allCloudData);
    return { success: true, count: insertedCount, message: `Success! Restored ${insertedCount} missing records.` };

  } catch (error) {
    console.error("Cloud restore failed:", error);
    return { success: false, message: error.message };
  }
};
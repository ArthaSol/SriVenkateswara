import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { getDB } from '../db/database';

export const DataImporter = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    setLoading(true);
    const files = e.target.files;
    const db = getDB();

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let book = 0;
        if (file.name.includes("100")) book = 100;
        if (file.name.includes("200")) book = 200;
        if (file.name.includes("500")) book = 500;
        if (file.name.includes("1,000")) book = 1000;
        if (file.name.includes("2,000")) book = 2000;
        if (file.name.includes("5,000")) book = 5000;
        if (file.name.includes("10,000")) book = 10000;
        if (file.name.includes("25,000")) book = 25000;
        if (file.name.includes("50,000")) book = 50000;
        if (file.name.includes("1,00,000")) book = 100000;

        if (book === 0) continue;

        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

        for (const row of json) {
          // Fix Date
          let date = new Date().toISOString().split('T')[0];
          if(row.Date) {
             const p = row.Date.toString().replace(/\.\./g, '.').split('.');
             if(p.length === 3) date = `${p[2].length===2?'20'+p[2]:p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
          }
          
          await db.run(`INSERT INTO donations (donation_date, book_type, amount, narration, receipt_no) VALUES (?,?,?,?,?)`, 
            [date, book, row.Amount||0, row['Name & Address']||'Unknown', row['Receipt No']||'']);
        }
      }
      alert("Done!");
      if(onComplete) onComplete();
    } catch(e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div className="p-4 bg-orange-100 rounded mb-4">
      <h3 className="font-bold">Import Data</h3>
      {loading ? "Processing..." : <input type="file" multiple onChange={handleFile} />}
    </div>
  );
};
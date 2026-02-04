import React, { useState } from 'react';
import { getDB } from '../db/database';

export const AddDonationForm = ({ onSaved }) => {
  const [book, setBook] = useState(100);
  const [amt, setAmt] = useState('');
  const [narr, setNarr] = useState('');
  
  const save = async (e) => {
    e.preventDefault();
    if(!amt || !narr) return alert("Fill details");
    const db = getDB();
    const today = new Date().toISOString().split('T')[0];
    await db.run(`INSERT INTO donations (donation_date, book_type, amount, narration) VALUES (?,?,?,?)`, [today, book, amt, narr]);
    setAmt(''); setNarr('');
    alert("Saved");
    if(onSaved) onSaved();
  };

  return (
    <form onSubmit={save} className="bg-white p-4 rounded shadow border-t-4 border-orange-500 mb-6">
      <div className="flex flex-wrap gap-2 mb-2">
        {[100,500,1000,5000,10000,100000].map(b => (
          <button key={b} type="button" onClick={()=>setBook(b)} className={`px-2 py-1 text-xs font-bold rounded ${book===b?'bg-orange-600 text-white':'bg-gray-200'}`}>₹{b}</button>
        ))}
      </div>
      <input type="number" placeholder="Amount" value={amt} onChange={e=>setAmt(e.target.value)} className="w-full p-2 border rounded mb-2" />
      <textarea placeholder="Details..." value={narr} onChange={e=>setNarr(e.target.value)} className="w-full p-2 border rounded mb-2"></textarea>
      <button className="w-full bg-orange-600 text-white font-bold py-3 rounded">SAVE</button>
    </form>
  );
};
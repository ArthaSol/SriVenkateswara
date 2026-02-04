import { useEffect, useState } from 'react';
import { initDB, getDB } from './db/database';
import { DataImporter } from './components/DataImporter';
import { AddDonationForm } from './components/AddDonationForm';

function App() {
  const [ready, setReady] = useState(false);
  const [total, setTotal] = useState(0);
  const [list, setList] = useState([]);
  const [tool, setTool] = useState(false);

  useEffect(() => { initDB().then(() => { setReady(true); refresh(); }); }, []);

  const refresh = async () => {
    const db = getDB();
    const t = await db.query("SELECT SUM(amount) as t FROM donations");
    setTotal(t.values[0].t || 0);
    const l = await db.query("SELECT * FROM donations ORDER BY id DESC LIMIT 5");
    setList(l.values || []);
  };

  if(!ready) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="bg-gray-50 min-h-screen p-4">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-bold text-orange-900">Temple Ledger</h1>
        <button onClick={()=>setTool(!tool)} className="text-xs bg-gray-200 px-2 py-1 rounded">Tools</button>
      </div>
      <div className="bg-orange-600 text-white p-6 rounded-xl shadow mb-6 text-center">
        <div className="text-3xl font-bold">₹ {total.toLocaleString()}</div>
        <div className="text-sm">Total Fund</div>
      </div>
      {tool && <DataImporter onComplete={refresh} />}
      <AddDonationForm onSaved={refresh} />
      <h3 className="font-bold text-gray-700 mb-2">Recent</h3>
      {list.map(x => (
        <div key={x.id} className="bg-white p-3 rounded shadow mb-2 flex justify-between">
          <div className="text-sm"><div className="font-bold">{x.narration}</div><div className="text-xs">{x.donation_date}</div></div>
          <div className="font-bold text-green-700">₹{x.amount}</div>
        </div>
      ))}
    </div>
  );
}
export default App;
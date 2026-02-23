import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid'; 
import { initDB, getDB, getAllDonations, deleteDonation } from './db/database';
// 👇 NEW: Added restoreFromCloud to the syncService import
import { syncPendingDonations, restoreFromCloud } from './db/syncService'; 
import { generatePDFData } from './pdfGenerator'; 
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Browser } from '@capacitor/browser'; 

// --- APP VERSION CONTROL ---
const APP_VERSION = "1.0.0"; 
const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/ArthaSol/SriVenkateswara/main/version.json";

// --- CONSTANTS ---
const ITEM_HEIGHT = 180; 
const OVERSCAN = 5;       

// --- THEME ENGINE ---
const THEMES = {
  surya: {
    name: 'Surya (Light)',
    bg: 'bg-orange-50',
    cardGradient: 'from-orange-600 to-amber-500',
    textPrimary: 'text-gray-900',
    textSecondary: 'text-gray-500',
    accent: 'text-orange-600',
    border: 'border-orange-100',
    inputBg: 'bg-white',
    fab: 'bg-orange-600'
  },
  chandra: {
    name: 'Chandra (Dark)',
    bg: 'bg-slate-900',
    cardGradient: 'from-slate-800 to-slate-700',
    textPrimary: 'text-slate-100',
    textSecondary: 'text-slate-400',
    accent: 'text-amber-400',
    border: 'border-slate-800',
    inputBg: 'bg-slate-800',
    fab: 'bg-amber-500'
  }
};

// --- UTILS ---
const getTodayStr = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return (new Date(d - offset)).toISOString().slice(0, 10);
};

const formatDateIN = (dateStr) => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
};

const formatCurrencyIN = (amount) => {
  if (!amount) return "0";
  const str = Math.round(amount).toString();
  let lastThree = str.substring(str.length - 3);
  let otherNumbers = str.substring(0, str.length - 3);
  if (otherNumbers !== '') lastThree = ',' + lastThree;
  return otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
};

const parseExcelDate = (input) => {
  if (!input) return "2000-01-01"; 
  if (typeof input === 'number') {
    const date = new Date(Math.round((input - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  const str = String(input).trim();
  const parts = str.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
  if (parts) {
    let day = parts[1].padStart(2, '0');
    let month = parts[2].padStart(2, '0');
    let year = parts[3];
    if (year.length === 2) year = "20" + year;
    return `${year}-${month}-${day}`; 
  }
  return "2000-01-01"; 
};

const triggerHaptic = async () => {
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch (e) { console.log('Haptics not available'); }
};

// --- ICONS ---
const Icons = {
  Home: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  List: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
  Chart: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>,
  Edit: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  Trash: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Plus: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>,
  Update: () => <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>,
  Phone: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
  DownloadCloud: () => <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg> // New Icon for Cloud
};

// ==========================================
// TOAST NOTIFICATION
// ==========================================
const Toast = ({ show, message, type }) => {
  if (!show) return null;
  const borderClass = type === 'error' ? 'border-red-500 text-red-700' : 'border-green-500 text-green-800';
  return (
    <div className={`fixed bottom-24 left-4 right-4 z-[100] flex items-center gap-3 px-6 py-4 rounded-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.2)] bg-white/95 backdrop-blur-md border-l-8 ${borderClass} animate-slide-up`}>
      <span className="text-xl">{type === 'error' ? '⚠️' : '✅'}</span>
      <span className="font-bold text-sm tracking-wide">{message}</span>
    </div>
  );
};

// ==========================================
// DANGER SHEET
// ==========================================
const DangerSheet = ({ isOpen, onClose, onConfirm }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
       <div className="w-full bg-white rounded-t-2xl p-6 animate-slide-up shadow-2xl">
          <div className="flex flex-col items-center gap-4 text-center">
             <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl">🗑️</div>
             <h3 className="text-xl font-bold text-gray-800">Delete Receipt?</h3>
             <div className="w-full flex gap-3 mt-2">
                <button onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-700 font-bold rounded-xl">Cancel</button>
                <button onClick={onConfirm} className="flex-1 py-4 bg-red-600 text-white font-bold rounded-xl shadow-lg">Delete</button>
             </div>
          </div>
       </div>
    </div>
  );
};

// ==========================================
// UPDATE SHEET
// ==========================================
const UpdateSheet = ({ updateInfo, onClose }) => {
  if (!updateInfo) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
       <div className="w-full bg-white rounded-t-2xl p-6 animate-slide-up shadow-2xl border-t-4 border-blue-500">
          <div className="flex flex-col items-center gap-4 text-center">
             <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                <Icons.Update />
             </div>
             <div>
                <h3 className="text-2xl font-black text-gray-800">New Version Available!</h3>
                <p className="text-blue-600 font-bold mt-1">v{updateInfo.version}</p>
             </div>
             <div className="w-full flex gap-3 mt-4">
                <button onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-xl">Later</button>
                <button onClick={() => Browser.open({ url: updateInfo.downloadUrl })} className="flex-[2] py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg">Update Now</button>
             </div>
          </div>
       </div>
    </div>
  );
};

// ==========================================
// COMPONENT: HOME SCREEN
// ==========================================
const HomeScreen = ({ totalFund, todayTotal, donations, currentTheme }) => (
  <div className="flex flex-col gap-6 pb-32">
     <div className={`relative overflow-hidden bg-gradient-to-br ${currentTheme.cardGradient} rounded-3xl p-6 shadow-xl text-white transition-colors duration-500`}>
        <div className="absolute -right-10 -bottom-10 opacity-10 text-9xl">🕉️</div>
        <p className="text-orange-100 text-sm font-medium tracking-widest uppercase">Total Temple Fund</p>
        <h1 className="text-4xl font-black mt-2 mb-1">₹ {formatCurrencyIN(totalFund)}</h1>
        <div className="flex items-center gap-2 mt-4 bg-white/20 w-max px-3 py-1 rounded-full backdrop-blur-sm">
           <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
           <span className="text-xs font-bold">Safe & Verified</span>
        </div>
     </div>

     <div className="grid grid-cols-2 gap-4">
        <div className={`${currentTheme.inputBg} p-4 rounded-2xl shadow-sm border ${currentTheme.border}`}>
           <p className={`${currentTheme.textSecondary} text-xs font-bold uppercase`}>Today</p>
           <p className={`text-2xl font-bold ${currentTheme.textPrimary}`}>₹ {formatCurrencyIN(todayTotal)}</p>
        </div>
        <div className={`${currentTheme.inputBg} p-4 rounded-2xl shadow-sm border ${currentTheme.border}`}>
           <p className={`${currentTheme.textSecondary} text-xs font-bold uppercase`}>Receipts</p>
           <p className={`text-2xl font-bold ${currentTheme.textPrimary}`}>{donations.length}</p>
        </div>
     </div>

     <div>
       <h3 className={`${currentTheme.textSecondary} font-bold text-sm mb-3 ml-2 uppercase tracking-wide`}>Recent Entries</h3>
       <div className="flex flex-col gap-3">
         {donations.slice(0, 5).map(item => (
           <div key={item.id} className={`${currentTheme.inputBg} p-4 rounded-xl border ${currentTheme.border} flex justify-between items-center shadow-sm`}>
              <div className="flex-1 min-w-0 pr-4">
                 <p className={`font-bold ${currentTheme.textPrimary} truncate`}>{item.donor_name}</p>
                 <p className={`text-xs ${currentTheme.textSecondary}`}>{formatDateIN(item.date)}</p>
              </div>
              <span className={`font-bold ${currentTheme.accent} whitespace-nowrap`}>₹ {formatCurrencyIN(item.amount)}</span>
           </div>
         ))}
       </div>
     </div>
  </div>
);

// ==========================================
// COMPONENT: LEDGER SCREEN
// ==========================================
const LedgerScreen = ({ donations, DENOMINATIONS, handleDelete, openEdit, currentTheme }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDenom, setFilterDenom] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);

  const safeFormatDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return "";
    try {
       const parts = dateStr.split('-');
       if (parts.length !== 3) return dateStr;
       return `${parts[2]}-${parts[1]}-${parts[0]}`;
    } catch (e) { return ""; }
  };

  const filtered = useMemo(() => {
    return donations.filter(d => {
       try {
         const safeName = String(d.donor_name || "").toLowerCase(); 
         const safeReceipt = String(d.receipt_no || "").toLowerCase();
         const safePhone = String(d.phone || "").toLowerCase(); 
         const term = (searchTerm || "").toLowerCase();

         const matchesSearch = safeName.includes(term) || safeReceipt.includes(term) || safePhone.includes(term);
         
         let matchesDenom = true;
         if (filterDenom !== "") {
            matchesDenom = d.denomination == filterDenom; 
         }
         return matchesDenom && matchesSearch;
       } catch (e) { return false; }
    });
  }, [donations, searchTerm, filterDenom]);

  const totalHeight = filtered.length * ITEM_HEIGHT;
  const startIndex = Math.floor(scrollTop / ITEM_HEIGHT);
  const endIndex = Math.min(
    filtered.length, 
    startIndex + Math.ceil((window.innerHeight) / ITEM_HEIGHT) + OVERSCAN
  );
  
  const visibleItems = filtered.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  const onScroll = (e) => {
    setScrollTop(e.target.scrollTop);
  };

  const handleCall = (e, phone) => {
    e.stopPropagation(); 
    if (!phone) return;
    window.open(`tel:${phone}`, '_system');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className={`flex-none ${currentTheme.bg} pt-2 pb-4 z-10 transition-colors duration-300`}>
         <input 
           type="text" 
           placeholder="Search Name, Receipt, or Phone..." 
           value={searchTerm} 
           onChange={e => setSearchTerm(e.target.value)} 
           className={`w-full ${currentTheme.inputBg} ${currentTheme.textPrimary} border-none shadow-sm p-4 rounded-xl font-medium outline-none focus:ring-2 focus:ring-orange-200 placeholder-gray-400`}
         />
         <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
            <button onClick={()=>setFilterDenom("")} className={`px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap ${filterDenom==="" ? 'bg-orange-600 text-white' : `${currentTheme.inputBg} ${currentTheme.textSecondary}`}`}>All</button>
            {DENOMINATIONS.map(d => (
               <button key={d} onClick={()=>setFilterDenom(d)} className={`px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap ${filterDenom==d ? 'bg-orange-600 text-white' : `${currentTheme.inputBg} ${currentTheme.textSecondary}`}`}>₹ {d}</button>
            ))}
         </div>
      </div>

      <div 
         className="flex-1 overflow-y-auto relative pb-32" 
         onScroll={onScroll} 
         ref={containerRef}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', top: 0, left: 0, right: 0 }}>
                {visibleItems.length === 0 && (
                   <div className="text-center py-10 opacity-50">
                      <p className="text-4xl">📭</p>
                      <p className={`text-sm ${currentTheme.textSecondary} mt-2`}>No receipts found.</p>
                   </div>
                )}

                {visibleItems.map(item => (
                  <div key={item.id} style={{ height: ITEM_HEIGHT - 12, marginBottom: '12px' }} className={`${currentTheme.inputBg} rounded-xl p-4 shadow-sm border ${currentTheme.border} relative overflow-hidden group flex flex-col justify-between`}>
                     <button onClick={()=>handleDelete(item.id)} className="absolute top-0 right-0 p-3 bg-red-50 text-red-500 rounded-bl-xl z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icons.Trash />
                     </button>
                     <div className="flex justify-between items-start pr-10">
                        <div className="overflow-hidden">
                          <span className={`text-xs font-bold ${currentTheme.textSecondary} bg-opacity-10 bg-gray-500 px-2 py-0.5 rounded mr-2 inline-block mb-1`}>#{item.receipt_no}</span>
                          <h3 className={`font-bold ${currentTheme.textPrimary} text-lg leading-tight line-clamp-2`}>{item.donor_name || "Unknown"}</h3>
                          {item.phone && <p className={`text-xs ${currentTheme.textSecondary} mt-1 flex items-center gap-1`}>📞 {item.phone}</p>}
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="block font-black text-xl text-green-600">₹{formatCurrencyIN(item.amount)}</span>
                          <span className={`text-xs ${currentTheme.textSecondary} whitespace-nowrap`}>{safeFormatDate(item.date)}</span>
                        </div>
                     </div>
                     
                     <div className="flex gap-2 mt-2">
                        {item.phone && (
                            <button onClick={(e)=>handleCall(e, item.phone)} className="flex-none px-4 py-2 bg-green-50 text-green-600 font-bold rounded-lg text-sm flex items-center justify-center gap-1 hover:bg-green-100">
                                <Icons.Phone /> Call
                            </button>
                        )}
                        <button onClick={()=>openEdit(item)} className="flex-1 py-2 bg-blue-50 text-blue-600 font-bold rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-blue-100">
                            <Icons.Edit /> Edit
                        </button>
                     </div>
                  </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// COMPONENT: TRANSACTION SHEET
// ==========================================
const TransactionSheet = ({ formMode, formData, setFormData, setFormMode, handleSave, DENOMINATIONS }) => {
  if (!formMode) return null;
  const isAdd = formMode === 'ADD';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-60 backdrop-blur-sm transition-opacity">
      <div className="w-full bg-white rounded-t-2xl p-6 animate-slide-up shadow-2xl h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h3 className="text-2xl font-bold text-orange-700">{isAdd ? 'New Donation' : 'Edit Receipt'}</h3>
          <button onClick={() => setFormMode(null)} className="p-2 bg-gray-100 rounded-full text-gray-500 font-bold">✕</button>
        </div>
        <form onSubmit={handleSave} className="flex flex-col gap-5 overflow-y-auto flex-1 pb-20">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Quick Select</label>
            <div className="flex overflow-x-auto gap-2 py-2 no-scrollbar">
              {DENOMINATIONS.map(d => (
                <button 
                  key={d} 
                  type="button"
                  onClick={() => setFormData(prev => ({...prev, denomination: d, amount: d}))}
                  className={`flex-shrink-0 px-4 py-2 rounded-full font-bold border ${formData.denomination == d ? 'bg-orange-600 text-white border-orange-600 shadow-lg' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  ₹{d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Amount (₹)</label>
            <input 
              type="number" 
              value={formData.amount} 
              onChange={(e) => setFormData({...formData, amount: e.target.value})} 
              className="w-full text-5xl font-black text-orange-600 border-b-2 border-orange-200 focus:border-orange-600 outline-none py-2 bg-transparent"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Sl No</label>
              <input type="text" value={formData.sl_no} onChange={(e) => setFormData({...formData, sl_no: e.target.value})} className="w-full border-2 border-gray-100 bg-gray-50 p-3 rounded-xl font-bold text-gray-700"/>
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Receipt No</label>
              <input type="text" value={formData.receipt_no} onChange={(e) => setFormData({...formData, receipt_no: e.target.value})} className="w-full border-2 border-gray-100 bg-gray-50 p-3 rounded-xl font-bold text-gray-700"/>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Donor Name & Address</label>
            <textarea 
              rows="3" 
              value={formData.donor_name} 
              onChange={(e) => setFormData({...formData, donor_name: e.target.value})} 
              className="w-full border-2 border-gray-200 p-3 rounded-xl text-lg font-medium focus:border-orange-500 outline-none"
              placeholder="Enter name..."
            ></textarea>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
            <input 
               type="tel" 
               value={formData.phone || ''} 
               onChange={(e) => setFormData({...formData, phone: e.target.value})} 
               className="w-full border-2 border-gray-100 p-3 rounded-xl font-medium"
               placeholder="98480..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Date</label>
            <input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} className="w-full border-2 border-gray-100 p-3 rounded-xl font-medium"/>
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-orange-600 to-amber-500 text-white py-4 rounded-xl font-black text-xl shadow-lg active:scale-95 transition-transform mt-4">
            {isAdd ? 'SAVE RECEIPT' : 'UPDATE RECEIPT'}
          </button>
        </form>
      </div>
    </div>
  );
};

const ReportFilterSheet = ({ isOpen, onClose, DENOMINATIONS, onGenerate }) => {
  if (!isOpen) return null;
  const [denom, setDenom] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleGen = () => { onGenerate(denom, startDate, endDate); onClose(); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-60 backdrop-blur-sm">
      <div className="w-full bg-white rounded-t-2xl p-6 animate-slide-up shadow-2xl">
        <h3 className="text-xl font-bold mb-4 text-orange-700">📄 Generate PDF Report</h3>
        <select value={denom} onChange={(e) => setDenom(e.target.value)} className="w-full border p-3 rounded-xl mb-4 font-bold bg-gray-50">
          <option value="ALL">All Denominations (Full)</option>
          {DENOMINATIONS.map(d => <option key={d} value={d}>₹ {formatCurrencyIN(d)}</option>)}
        </select>
        <div className="flex gap-2 mb-6">
          <input type="date" className="border p-3 rounded-xl w-full" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <input type="date" className="border p-3 rounded-xl w-full" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button onClick={handleGen} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg text-lg">Download PDF</button>
        <button onClick={onClose} className="w-full py-4 text-gray-500 font-bold mt-2">Cancel</button>
      </div>
    </div>
  );
};

// ==========================================
// MAIN APP COMPONENT
// ==========================================
function App() {
  const [activeTab, setActiveTab] = useState('home'); 
  const [totalFund, setTotalFund] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [donations, setDonations] = useState([]);
  
  const [themeMode, setThemeMode] = useState('surya'); 
  const currentTheme = THEMES[themeMode];
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const [deleteConfirmationId, setDeleteConfirmationId] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [formMode, setFormMode] = useState(null);
  const [formData, setFormData] = useState({ id: null, donor_name: '', denomination: '100', amount: '100', sl_no: '', receipt_no: '', date: '', phone: '' });
  const [isReportSheetOpen, setIsReportSheetOpen] = useState(false);
  
  // 👇 NEW: Added state for the cloud restore spinner
  const [isRestoring, setIsRestoring] = useState(false);
  
  const DENOMINATIONS = [100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000];

  // 👈 PHASE 3: BACKGROUND CLOUD SYNC
  useEffect(() => {
    const setup = async () => { 
        try { 
            await initDB(); 
            refreshData(); 
            syncPendingDonations(); // Push any offline saves immediately
        } catch (e) { 
            console.error("DB Error:", e); 
        } 
    };
    setup();
    checkForUpdates();

    // Check for internet and sync silently every 60 seconds
    const syncInterval = setInterval(() => {
        syncPendingDonations();
    }, 60000);

    return () => clearInterval(syncInterval);
  }, []);

  const checkForUpdates = async () => {
    try {
      const response = await fetch(UPDATE_CHECK_URL);
      if (!response.ok) return;
      const data = await response.json();
      if (data.version !== APP_VERSION) setUpdateAvailable(data);
    } catch (e) { console.log("Offline"); }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const refreshData = async () => {
    const db = await getDB();
    const resTotal = await db.query("SELECT SUM(amount) as t FROM donations WHERE type='CREDIT'");
    setTotalFund(resTotal.values[0].t || 0);

    const todayStr = getTodayStr(); 
    const resToday = await db.query(`SELECT SUM(amount) as t FROM donations WHERE date = '${todayStr}'`);
    setTodayTotal(resToday.values[0].t || 0);

    const all = await getAllDonations();
    setDonations(all);
  };

  const openAdd = () => {
    triggerHaptic();
    setFormData({ id: null, donor_name: '', denomination: '100', amount: '100', sl_no: '', receipt_no: '', date: getTodayStr(), phone: '' });
    setFormMode('ADD');
  };

  const openEdit = (item) => {
    triggerHaptic();
    setFormData({ ...item });
    setFormMode('EDIT'); 
  };

  const handleRequestDelete = (id) => {
    setDeleteConfirmationId(id);
    triggerHaptic();
  };

  // 👈 UPDATED: GENERATES UUID AND TRIGGERS CLOUD SYNC ON SAVE
  const handleSave = async (e) => {
    e.preventDefault();
    const db = await getDB();
    const { id, donor_name, denomination, sl_no, receipt_no, date, amount, phone } = formData;
    const finalAmount = parseFloat(amount) || 0;
    
    if (formMode === 'EDIT') {
      await db.run("UPDATE donations SET donor_name=?, amount=?, denomination=?, sl_no=?, receipt_no=?, date=?, phone=?, sync_status='pending' WHERE id=?", [donor_name, finalAmount, denomination, sl_no, receipt_no, date, phone, id]);
      showToast('Receipt Updated!');
    } else {
      const newUuid = uuidv4();
      await db.run("INSERT INTO donations (uuid, date, donor_name, amount, type, denomination, sl_no, receipt_no, phone, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')", [newUuid, date, donor_name, finalAmount, 'CREDIT', denomination, sl_no, receipt_no, phone]);
      showToast('Receipt Saved Successfully!');
    }
    triggerHaptic();
    setFormMode(null);
    refreshData();
    syncPendingDonations(); // Push to Supabase instantly
  };

  const executeDelete = async () => {
    if (!deleteConfirmationId) return;
    await deleteDonation(deleteConfirmationId);
    triggerHaptic();
    showToast('Receipt Deleted', 'error');
    setDeleteConfirmationId(null);
    refreshData();
  };

  const handleGeneratePDF = async (denom, startDate, endDate) => {
    try {
      let filtered = donations;
      let filterTxt = "All Denominations";
      if (denom !== "ALL") { 
        filtered = filtered.filter(d => d.denomination == denom); 
        filterTxt = `Denomination: ${denom}`; 
      }
      if (startDate && endDate) { 
        filtered = filtered.filter(d => d.date >= startDate && d.date <= endDate); 
        filterTxt += ` | Date: ${formatDateIN(startDate)} to ${formatDateIN(endDate)}`; 
      }
      const pdfDataUri = generatePDFData(filtered, filterTxt);
      const base64Data = pdfDataUri.split(',')[1];
      const fileName = `Sri_Venkateswara_Swamy_Temple_Report_${Date.now()}.pdf`;
      const savedFile = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Documents, recursive: true });
      await Share.share({ title: 'Temple Report', url: savedFile.uri });
      showToast('PDF Generated!');
    } catch (error) { showToast(error.message, 'error'); }
  };

  // 👇 NEW: Export Clean Excel (No UUID)
  const handleShareableExcel = async () => {
      try {
        const wb = XLSX.utils.book_new();
        const uniqueDenoms = [...new Set(donations.map(d => d.denomination))].sort((a, b) => a - b);
        if (uniqueDenoms.length === 0) { showToast("No data to export!", 'error'); return; }
        
        uniqueDenoms.forEach(denom => {
            const sheetRows = donations.filter(d => d.denomination == denom).map(d => ({
                "Date": formatDateIN(d.date), 
                "Sl No": d.sl_no, 
                "Receipt No": d.receipt_no, 
                "Name & Address": d.donor_name, 
                "Amount": d.amount, 
                "Phone": d.phone
            }));
            
            const ws = XLSX.utils.json_to_sheet(sheetRows, { origin: "A4" });
            XLSX.utils.sheet_add_aoa(ws, [["SRI VENKATESWARA SWAMY TEMPLE"]], { origin: "A1" });
            XLSX.utils.sheet_add_aoa(ws, [[`Public Report - ${denom}`]], { origin: "A2" });
            ws['!merges'] = [
              { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, 
              { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
            ];
            XLSX.utils.book_append_sheet(wb, ws, String(denom));
        });

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const fileName = `Temple_Public_Report_${getTodayStr()}.xlsx`;
        
        const savedFile = await Filesystem.writeFile({ path: fileName, data: wbout, directory: Directory.Cache, recursive: true });
        await Share.share({ title: 'Temple Public Report', url: savedFile.uri });
        showToast('Clean Report Created!');
    } catch (error) { showToast("Export Failed", 'error'); }
  };

  // 👈 PHASE 4: Admin Backup (Includes UUID)
  const handleExportBackup = async () => {
     try {
        const wb = XLSX.utils.book_new();
        const uniqueDenoms = [...new Set(donations.map(d => d.denomination))].sort((a, b) => a - b);
        if (uniqueDenoms.length === 0) { showToast("No data to export!", 'error'); return; }
        
        uniqueDenoms.forEach(denom => {
            const sheetRows = donations.filter(d => d.denomination == denom).map(d => ({
                "uuid": d.uuid, // THIS SAVES US FROM CLOUD DUPLICATES
                "Date": formatDateIN(d.date), 
                "Sl No": d.sl_no, 
                "Receipt No": d.receipt_no, 
                "Name & Address": d.donor_name, 
                "Amount": d.amount, 
                "Phone": d.phone
            }));
            
            const ws = XLSX.utils.json_to_sheet(sheetRows, { origin: "A4" });

            XLSX.utils.sheet_add_aoa(ws, [["SRI VENKATESWARA SWAMY TEMPLE"]], { origin: "A1" });
            XLSX.utils.sheet_add_aoa(ws, [[`System Admin Backup - ${denom}`]], { origin: "A2" });

            ws['!merges'] = [
              { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Expanded for UUID column
              { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
            ];

            XLSX.utils.book_append_sheet(wb, ws, String(denom));
        });

        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const fileName = `Sri_Venkateswara_System_Backup_${getTodayStr()}.xlsx`;
        
        const savedFile = await Filesystem.writeFile({ path: fileName, data: wbout, directory: Directory.Cache, recursive: true });
        await Share.share({ title: 'System Backup', url: savedFile.uri });
        showToast('System Backup Created!');
    } catch (error) { showToast("Export Failed", 'error'); }
  };

  // 👇 NEW: Trigger the Cloud Restore Engine
  const handleCloudRestoreTrigger = async () => {
    if (!window.confirm("Check cloud for missing records? This requires internet.")) return;
    
    setIsRestoring(true);
    triggerHaptic();
    const result = await restoreFromCloud();
    setIsRestoring(false);
    
    if (result.success) {
      showToast(result.message);
      if (result.count > 0) {
        refreshData(); // Refresh UI if new data came in
      }
    } else {
      showToast(result.message, 'error');
    }
  };

  // 👈 UPDATED: READS UUID ON RESTORE TO PREVENT DUPLICATES
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = async (evt) => {
      try {
          const bstr = evt.target.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const db = await getDB();
          let count = 0;
          const normalize = (str) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');

          for (const sheetName of wb.SheetNames) {
            const cleanSheetName = sheetName.replace(/,/g, '').trim();
            const sheetDenomFallback = parseInt(cleanSheetName);
            const ws = wb.Sheets[sheetName];
            
            const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });
            if (!rawData || rawData.length === 0) continue;

            let headerRowIndex = 0;
            let headers = [];
            
            for (let i = 0; i < Math.min(rawData.length, 10); i++) {
                const row = rawData[i].map(cell => normalize(cell)); 
                if (row.includes('slno') || row.includes('receiptno') || row.includes('name')) {
                    headerRowIndex = i;
                    headers = row;
                    break;
                }
            }

            for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                const row = rawData[i];
                if (!row || row.length === 0) continue;

                const getValue = (keyPart) => {
                    const idx = headers.findIndex(h => h && h.includes(keyPart));
                    return idx !== -1 ? row[idx] : null;
                };

                const sl = getValue('slno') || getValue('sl') || getValue('serial') || getValue('s.no');
                const rcpt = getValue('receipt') || getValue('recept') || getValue('reciept') || getValue('rcpt') || 'Pending';
                
                const name = getValue('name') || getValue('donor') || "To be updated";
                const rawDate = getValue('date');
                const date = parseExcelDate(rawDate);
                
                let phoneRaw = getValue('phone') || getValue('mobile') || getValue('contact') || "";
                const phone = String(phoneRaw).replace(/[^0-9]/g, '');

                let finalDenom = 0;
                const denomVal = getValue('denomination');
                if (denomVal) finalDenom = parseInt(denomVal);
                else if (!isNaN(sheetDenomFallback)) finalDenom = sheetDenomFallback;

                if (!finalDenom || finalDenom === 0) continue;

                let finalAmount = 0;
                const amtVal = getValue('amount');
                if (amtVal) {
                    const cleanAmt = String(amtVal).replace(/,/g, '');
                    const parsed = parseFloat(cleanAmt);
                    if (parsed > 0) finalAmount = parsed;
                }
                
                if (finalAmount === 0 && sl) finalAmount = finalDenom;
                if (!sl && finalAmount === 0) continue; 

                // CLOUD INTELLIGENCE: If the excel sheet has a UUID, it's a restore -> 'synced'. If missing -> 'pending'
                const importedUuid = getValue('uuid');
                const finalUuid = importedUuid || uuidv4();
                const syncStatus = importedUuid ? 'synced' : 'pending';

                if (finalAmount > 0) {
                   await db.run(`INSERT INTO donations (uuid, date, donor_name, amount, type, denomination, sl_no, receipt_no, phone, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                     [finalUuid, date, name, finalAmount, 'CREDIT', finalDenom, sl || 'Pending', rcpt, phone, syncStatus]);
                   count++;
                }
            }
          }
          
          triggerHaptic();
          if (count === 0) {
             showToast("Found 0 receipts. Check Excel headers.", 'error');
          } else {
             showToast(`Success! Imported ${count} receipts.`);
             refreshData();
             syncPendingDonations();
          }
      } catch(err) { showToast("Import Error: " + err.message, 'error'); }
    };
    reader.readAsBinaryString(file);
  };

  const ReportsScreen = () => (
    <div className="flex flex-col gap-4 pb-32">
       <h2 className={`text-2xl font-bold ${currentTheme.textPrimary} px-2`}>Tools & Reports</h2>
       
       <div onClick={() => setIsReportSheetOpen(true)} className={`${currentTheme.inputBg} p-6 rounded-2xl shadow-sm border ${currentTheme.border} flex items-center gap-4 active:scale-95 transition-transform`}>
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-2xl">📄</div>
          <div>
             <h3 className={`font-bold ${currentTheme.textPrimary}`}>PDF Report</h3>
             <p className={`text-xs ${currentTheme.textSecondary}`}>Generate printable list</p>
          </div>
       </div>

       {/* 👇 NEW: Shareable Excel Button */}
       <div onClick={handleShareableExcel} className={`${currentTheme.inputBg} p-6 rounded-2xl shadow-sm border ${currentTheme.border} flex items-center gap-4 active:scale-95 transition-transform`}>
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-2xl">📊</div>
          <div>
             <h3 className={`font-bold ${currentTheme.textPrimary}`}>Shareable Excel</h3>
             <p className={`text-xs ${currentTheme.textSecondary}`}>Clean data for auditors</p>
          </div>
       </div>

       {/* 👈 UPDATED: Admin Backup Button */}
       <div onClick={handleExportBackup} className={`${currentTheme.inputBg} p-6 rounded-2xl shadow-sm border ${currentTheme.border} flex items-center gap-4 active:scale-95 transition-transform`}>
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-2xl">💾</div>
          <div>
             <h3 className={`font-bold ${currentTheme.textPrimary}`}>System Backup</h3>
             <p className={`text-xs ${currentTheme.textSecondary}`}>Master file with UUIDs</p>
          </div>
       </div>

       <label className={`${currentTheme.inputBg} p-6 rounded-2xl shadow-sm border ${currentTheme.border} flex items-center gap-4 active:scale-95 transition-transform cursor-pointer`}>
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-2xl">📥</div>
          <div>
             <h3 className={`font-bold ${currentTheme.textPrimary}`}>Import Data</h3>
             <p className={`text-xs ${currentTheme.textSecondary}`}>Restore from Excel file</p>
          </div>
          <input type="file" accept=".xlsx" onChange={handleFileUpload} className="hidden" />
       </label>

       {/* 👇 NEW: 1-Click Cloud Restore Button */}
       <div onClick={handleCloudRestoreTrigger} className={`${currentTheme.inputBg} p-6 rounded-2xl shadow-sm border ${currentTheme.border} flex items-center gap-4 active:scale-95 transition-transform ${isRestoring ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
             <Icons.DownloadCloud />
          </div>
          <div>
             <h3 className={`font-bold ${currentTheme.textPrimary}`}>
               {isRestoring ? 'Downloading...' : 'Restore from Cloud'}
             </h3>
             <p className={`text-xs ${currentTheme.textSecondary}`}>Pull missing records safely</p>
          </div>
       </div>
    </div>
  );

  return (
    <div className={`fixed inset-0 ${currentTheme.bg} font-sans transition-colors duration-500 overflow-hidden flex flex-col`}>
      <Toast show={toast.show} message={toast.message} type={toast.type} />

      <div className={`flex-none ${currentTheme.inputBg}/90 backdrop-blur-md z-20 pt-12 pb-3 px-4 border-b ${currentTheme.border} flex items-center gap-3 shadow-sm transition-colors duration-500`}>
         <button onClick={() => {
            triggerHaptic();
            setThemeMode(prev => prev === 'surya' ? 'chandra' : 'surya');
            showToast(`Theme: ${themeMode === 'surya' ? 'Chandra (Night)' : 'Surya (Day)'}`);
         }}>
             <img 
               src="/logo.png" 
               alt="Logo"
               onError={(e) => {e.target.style.display='none'; e.target.nextSibling.style.display='flex'}}
               className={`w-12 h-12 object-contain rounded-full border ${currentTheme.border}`}
             />
             <div className="w-8 h-8 bg-orange-600 rounded-lg hidden items-center justify-center text-white font-bold">🕉️</div>
         </button>
         
         <h1 style={{ fontFamily: "'Ponnala', serif" }} className={`text-3xl font-bold ${currentTheme.textPrimary} pt-2`}>ఓం నమో వేంకటేశాయ</h1>
      </div>

      <div className="flex-1 overflow-hidden relative w-full max-w-md mx-auto">
        {activeTab === 'home' && (
           <div className="h-full overflow-y-auto p-4">
              <HomeScreen totalFund={totalFund} todayTotal={todayTotal} donations={donations} currentTheme={currentTheme} />
           </div>
        )}
        
        {activeTab === 'ledger' && (
           <div className="h-full px-4 flex flex-col">
               <LedgerScreen 
                  donations={donations} 
                  DENOMINATIONS={DENOMINATIONS} 
                  handleDelete={handleRequestDelete} 
                  openEdit={openEdit} 
                  currentTheme={currentTheme}
               />
           </div>
        )}

        {activeTab === 'reports' && (
           <div className="h-full overflow-y-auto p-4">
             <ReportsScreen />
           </div>
        )}
      </div>

      {activeTab !== 'reports' && (
        <button onClick={openAdd} className={`fixed bottom-24 right-6 w-16 h-16 ${currentTheme.fab} rounded-full text-white shadow-2xl flex items-center justify-center hover:opacity-90 active:scale-90 transition-transform z-30`}>
           <Icons.Plus />
        </button>
      )}

      <div className={`flex-none ${currentTheme.inputBg} border-t ${currentTheme.border} pb-safe pt-2 px-6 flex justify-between items-center z-40 h-20 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] transition-colors duration-500`}>
         <button onClick={()=>{triggerHaptic(); setActiveTab('home')}} className={`flex flex-col items-center gap-1 w-16 ${activeTab==='home' ? currentTheme.accent : currentTheme.textSecondary}`}>
            <Icons.Home />
            <span className="text-[10px] font-bold">Home</span>
         </button>
         <button onClick={()=>{triggerHaptic(); setActiveTab('ledger')}} className={`flex flex-col items-center gap-1 w-16 ${activeTab==='ledger' ? currentTheme.accent : currentTheme.textSecondary}`}>
            <Icons.List />
            <span className="text-[10px] font-bold">Ledger</span>
         </button>
         <button onClick={()=>{triggerHaptic(); setActiveTab('reports')}} className={`flex flex-col items-center gap-1 w-16 ${activeTab==='reports' ? currentTheme.accent : currentTheme.textSecondary}`}>
            <Icons.Chart />
            <span className="text-[10px] font-bold">Reports</span>
         </button>
      </div>

      <TransactionSheet formMode={formMode} formData={formData} setFormData={setFormData} setFormMode={setFormMode} handleSave={handleSave} DENOMINATIONS={DENOMINATIONS}/>
      <DangerSheet isOpen={!!deleteConfirmationId} onClose={() => setDeleteConfirmationId(null)} onConfirm={executeDelete} />
      <UpdateSheet updateInfo={updateAvailable} onClose={() => setUpdateAvailable(null)} />
      <ReportFilterSheet isOpen={isReportSheetOpen} onClose={() => setIsReportSheetOpen(false)} DENOMINATIONS={DENOMINATIONS} onGenerate={handleGeneratePDF}/>
    </div>
  );
}

export default App;
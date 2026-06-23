import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import QRScanner from './QRScanner.jsx';
import ScanResult from './ScanResult';
import ManualCheckIn from './ManualCheckIn'; // The new component

function StaffAppShell() {
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // 1. Missing Token State (Slice A5)
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 max-w-sm w-full">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Invalid Link</h2>
          <p className="text-sm text-slate-500">Please ask the host to send you a new Chek-In link.</p>
        </motion.div>
      </div>
    );
  }

  // 2. Active State (Scanner or Manual Entry)
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col relative overflow-hidden">
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center z-10">
        <h1 className="text-sm font-bold tracking-wide text-slate-300">ExplaraX Chek-In</h1>
        <span className="px-3 py-1 bg-[#7E57C2]/20 text-[#7E57C2] text-xs font-bold rounded-full border border-[#7E57C2]/30">
          Gate 1
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-md mx-auto relative z-10">
        {/* Toggle between Manual Check-In and the Camera */}
        {showManualEntry ? (
          <ManualCheckIn onClose={() => setShowManualEntry(false)} />
        ) : (
          <div className="w-full flex flex-col items-center">
            <QRScanner onScanSuccess={() => {}} />
            
            <button 
              onClick={() => setShowManualEntry(true)}
              className="mt-8 px-8 py-4 bg-slate-800 text-white font-semibold rounded-2xl border border-slate-700 shadow-xl active:scale-95 transition-all w-full text-lg"
            >
              Manual Check-in
            </button>
          </div>
        )}
      </main>

      {/* Global Validation Overlay: Listens to both the Camera and the Manual Check-in */}
      <ScanResult staffId="staff-01" gateId="Gate A" eventId="evt-01" />
    </div>
  );
}

export default StaffAppShell;
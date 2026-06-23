import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import QRScanner from './QRScanner.jsx';

function StaffAppShell() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [scanState, setScanState] = useState('idle'); // 'idle', 'success', 'error'
  const [scanResult, setScanResult] = useState(null);

  const handleScanSuccess = (decodedText) => {
    setScanResult(decodedText);
    
    // Simulate a successful API validation for now
    setScanState('success');

    // Auto-dismiss the green screen after 3 seconds (per Slice A2 PRD)
    setTimeout(() => {
      setScanState('idle');
      setScanResult(null);
    }, 1000);
  };

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

  // 2. Success State (Slice A2 Green Screen)
  if (scanState === 'success') {
    return (
      <div className="min-h-screen bg-[#5BC97C] flex flex-col items-center justify-center p-6 text-white text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2 className="text-4xl font-black mb-4 uppercase tracking-wider">Valid Ticket</h2>
          <p className="text-green-50 mb-8 font-mono text-lg break-all">{scanResult}</p>
          <p className="text-green-100 text-sm animate-pulse">Ready for next scan in 1s...</p>
        </motion.div>
      </div>
    );
  }

  // 3. Error State (Slice A2 Red Screen)
  if (scanState === 'error') {
    return (
      <div className="min-h-screen bg-[#D64545] flex flex-col items-center justify-center p-6 text-white text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2 className="text-4xl font-black mb-4 uppercase tracking-wider">Invalid Ticket</h2>
          <p className="text-red-50 mb-8 font-mono break-all">{scanResult}</p>
          <button 
            onClick={() => setScanState('idle')}
            className="px-6 py-2 bg-white/20 rounded-lg font-bold hover:bg-white/30 transition-colors"
          >
            Dismiss
          </button>
        </motion.div>
      </div>
    );
  }

  // 4. Active Scanning State (Default)
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
        <h1 className="text-sm font-bold tracking-wide text-slate-300">ExplaraX Chek-In</h1>
        <span className="px-3 py-1 bg-[#7E57C2]/20 text-[#7E57C2] text-xs font-bold rounded-full border border-[#7E57C2]/30">
          Gate 1
        </span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-md mx-auto">
        {/* Render Kiro's QR Scanner */}
        <QRScanner onScanSuccess={handleScanSuccess} />
      </main>
    </div>
  );
}

export default StaffAppShell;
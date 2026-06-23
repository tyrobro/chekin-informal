import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Extracted Teammate Hardware Logic (Translated to JS)
function useCamera() {
  const [facingMode, setFacingMode] = useState('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // Check physical lenses
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then(devices => {
        setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1);
      }).catch(console.error);
  }, []);

  const flipCamera = () => {
    if (isSwitching) return;
    setIsSwitching(true);
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  return {
    facingMode, setFacingMode, hasMultipleCameras, torchAvailable, setTorchAvailable,
    isTorchOn, setIsTorchOn, cameraError, setCameraError, isSwitching, setIsSwitching, flipCamera
  };
}

export default function QRScanner({ onScanSuccess }) {
  const camera = useCamera();
  const [scannerKey, setScannerKey] = useState(0); // The Nuke Key
  
  const html5QrRef = useRef(null);
  const startIdRef = useRef(0); // Teammate's Cancel-Token Pattern
  const isScanningRef = useRef(false);

  const handleScan = useCallback((decodedText) => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    onScanSuccess(decodedText);
    setTimeout(() => { isScanningRef.current = false; }, 1500); // Sticky lock deduplication
  }, [onScanSuccess]);

  // Main Hardware Initialization
  useEffect(() => {
    let mounted = true;
    const currentStartId = ++startIdRef.current;
    
    const initScanner = async () => {
      // 1. Progressive Constraint Relaxation
      const constraints = {
        video: { facingMode: camera.facingMode }
      };

      try {
        // Pre-flight check to see if hardware accepts constraint
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (currentStartId !== startIdRef.current || !mounted) {
            stream.getTracks().forEach(t => t.stop());
            return; // Cancel stale initialization
        }

        // Check Torch Capabilities
        const track = stream.getVideoTracks()[0];
        camera.setTorchAvailable(!!track.getCapabilities?.()?.torch);
        stream.getTracks().forEach(t => t.stop()); // Free the lens for the library

      } catch (err) {
        camera.setCameraError("Could not access camera hardware.");
        camera.setIsSwitching(false);
        return;
      }

      // 2. Library Initialization
      html5QrRef.current = new Html5Qrcode(`reader-${scannerKey}`);
      try {
        await html5QrRef.current.start(
          { facingMode: camera.facingMode },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => handleScan(decodedText),
          () => {} // Suppress frame errors
        );
        camera.setCameraError(null);
      } catch (err) {
        console.error("Scanner initialization failed:", err);
      } finally {
        camera.setIsSwitching(false);
      }
    };

    // 500ms Hardware Buffer
    const timer = setTimeout(() => { initScanner(); }, 500);

    // 3. The Visibility API (Better background handling on mobile)
    const handleVisibilityChange = () => {
      if (document.hidden && html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {});
      } else if (!document.hidden) {
        setScannerKey(k => k + 1); // Rebuild on foreground
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (html5QrRef.current) {
        html5QrRef.current.stop().catch(() => {}).then(() => {
          html5QrRef.current.clear();
        });
      }
    };
  }, [camera.facingMode, scannerKey, handleScan]); 

  // Combined Flip & DOM Nuke
  const executeFlip = () => {
    camera.setIsTorchOn(false); // Force torch off state
    camera.flipCamera();
    setScannerKey(prev => prev + 1); // Destroy old DOM
  };

  const toggleTorch = async () => {
    try {
      if (html5QrRef.current) {
        await html5QrRef.current.applyVideoConstraints({
          advanced: [{ torch: !camera.isTorchOn }]
        });
        camera.setIsTorchOn(!camera.isTorchOn);
      }
    } catch (e) {
      console.warn("Torch failed to toggle", e);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Viewport UI */}
      <div className="relative w-full aspect-[4/5] bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
        
        {camera.cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-20 bg-slate-900/90">
            <p className="text-[#D64545] font-bold">{camera.cameraError}</p>
          </div>
        ) : (
          <div 
            id={`reader-${scannerKey}`} 
            className="w-full h-full [&>video]:w-full [&>video]:h-full [&>video]:object-cover" 
          />
        )}
        
        {/* Reticle Overlay */}
        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
          <div className="relative w-64 h-64">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#7E57C2]" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#7E57C2]" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#7E57C2]" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#7E57C2]" />
            <div className="absolute top-0 w-full h-0.5 bg-[#5BC97C] shadow-[0_0_8px_#5BC97C] animate-[scan_2s_ease-in-out_infinite]" />
          </div>
        </div>
        
        <p className="absolute bottom-6 w-full text-center text-sm font-medium text-slate-300 z-10 drop-shadow-md bg-black/40 py-1">
          Align QR code within the frame
        </p>
      </div>

      {/* Control Buttons */}
      <div className="flex justify-center items-center gap-6 mt-6 w-full">
        {camera.hasMultipleCameras && (
          <button 
            onClick={executeFlip} 
            disabled={camera.isSwitching}
            className="p-4 rounded-full bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 transition-all border border-slate-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}
        
        {camera.torchAvailable && (
          <button 
            onClick={toggleTorch}
            className={`p-4 rounded-full transition-all border ${camera.isTorchOn ? 'bg-[#5BC97C] text-black border-[#5BC97C]' : 'bg-slate-800 text-white hover:bg-slate-700 border-slate-700'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        )}
      </div>

      {/* Global Animation Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(16rem); } }
        /* Library CSS Overrides */
        #reader-${scannerKey} { border: none !important; padding: 0 !important; }
      `}} />
    </div>
  );
}
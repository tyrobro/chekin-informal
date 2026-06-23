import { useEffect, useRef, useCallback, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// ─────────────────────────────────────────────
// ExplaraX UI tokens
// ─────────────────────────────────────────────
const TOKEN = {
  primary: '#7E57C2',
  error: '#D64545',
  heading: '#1F1E1E',
  body: '#3B3535',
};

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DEBOUNCE_MS = 5_000; // 5 seconds before same QR fires again
const HTML5QR_ELEMENT_ID = 'qr-scanner-region';
const SCAN_FPS = 15;
const SCAN_QR_BOX_PX = 250;

// ─────────────────────────────────────────────
// Helper: does the browser support BarcodeDetector?
// ─────────────────────────────────────────────
function isBarcodeDetectorSupported() {
  return (
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window
  );
}

// ─────────────────────────────────────────────
// Helper: does the browser support Torch/Flashlight?
// ─────────────────────────────────────────────
async function isTorchSupported(stream) {
  try {
    const track = stream?.getVideoTracks()?.[0];
    if (!track) return false;
    const capabilities = track.getCapabilities?.();
    return capabilities?.torch === true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// QRScanner component
//
// Props:
//   onScanSuccess(decodedText: string) — called once per unique QR per debounce window
// ─────────────────────────────────────────────
function QRScanner({ onScanSuccess }) {
  // — state —
  const [status, setStatus] = useState('idle'); // idle | starting | scanning | error | denied
  const [errorMessage, setErrorMessage] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [isSwitching, setIsSwitching] = useState(false); // true during the 500ms hardware-release buffer

  // — refs (survive re-renders, not reactive) —
  const videoRef = useRef(null);          // <video> element for BarcodeDetector path
  const streamRef = useRef(null);         // MediaStream
  const animFrameRef = useRef(null);      // requestAnimationFrame handle
  const html5QrRef = useRef(null);        // Html5Qrcode instance
  const lastScannedRef = useRef(null);    // { text, timestamp }
  const debounceTimerRef = useRef(null);
  // Tracks the active facing mode for use inside callbacks without stale closures
  const facingModeRef = useRef('environment');

  // ── Debounce guard ──────────────────────────
  const shouldFire = useCallback((text) => {
    const now = Date.now();
    const last = lastScannedRef.current;
    if (last && last.text === text && now - last.timestamp < DEBOUNCE_MS) {
      return false;
    }
    lastScannedRef.current = { text, timestamp: now };
    return true;
  }, []);

  // ── Haptic + callback ───────────────────────
  const handleDecode = useCallback((decodedText) => {
    if (!shouldFire(decodedText)) return;
    if (navigator.vibrate) navigator.vibrate(50);
    onScanSuccess?.(decodedText);
  }, [shouldFire, onScanSuccess]);

  // ── Tear-down helpers ───────────────────────
  const stopBarcodeDetectorLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const releaseCamera = useCallback(async () => {
    stopBarcodeDetectorLoop();

    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear();
      } catch { /* already stopped */ }
      html5QrRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setTorchOn(false);
    setTorchAvailable(false);
  }, [stopBarcodeDetectorLoop]);

  // ── BarcodeDetector scan loop ───────────────
  const startBarcodeDetectorLoop = useCallback((detector, videoEl) => {
    const loop = async () => {
      if (!videoEl || videoEl.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      try {
        const barcodes = await detector.detect(videoEl);
        for (const barcode of barcodes) {
          if (barcode.rawValue) {
            handleDecode(barcode.rawValue);
            break; // process one per frame
          }
        }
      } catch { /* frame decode error — keep looping */ }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [handleDecode]);

  // ── Primary: BarcodeDetector path ──────────
  const startWithBarcodeDetector = useCallback(async () => {
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingModeRef.current },
        audio: false,
      });
      streamRef.current = stream;

      const videoEl = videoRef.current;
      videoEl.srcObject = stream;
      await videoEl.play();

      const torchOk = await isTorchSupported(stream);
      setTorchAvailable(torchOk);

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      setStatus('scanning');
      startBarcodeDetectorLoop(detector, videoEl);
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setStatus('denied');
      } else {
        setStatus('error');
        setErrorMessage(err?.message ?? 'Camera could not be started.');
      }
    }
  }, [startBarcodeDetectorLoop]);

  // ── Fallback: html5-qrcode path ─────────────
  const startWithHtml5Qrcode = useCallback(async () => {
    setStatus('starting');
    try {
      const html5Qr = new Html5Qrcode(HTML5QR_ELEMENT_ID);
      html5QrRef.current = html5Qr;

      await html5Qr.start(
        { facingMode: facingModeRef.current },
        { fps: SCAN_FPS, qrbox: { width: SCAN_QR_BOX_PX, height: SCAN_QR_BOX_PX } },
        (decodedText) => handleDecode(decodedText),
        () => { /* scan failure per frame — ignore */ },
      );

      // html5-qrcode owns the <video>; torch not available in this path
      setTorchAvailable(false);
      setStatus('scanning');
    } catch (err) {
      if (
        typeof err === 'string'
          ? err.includes('Permission')
          : err?.name === 'NotAllowedError'
      ) {
        setStatus('denied');
      } else {
        setStatus('error');
        setErrorMessage(
          typeof err === 'string' ? err : (err?.message ?? 'Camera could not be started.'),
        );
      }
    }
  }, [handleDecode]);

  // ── Start scanning (chooses path automatically) ──
  const startScanning = useCallback(() => {
    if (isBarcodeDetectorSupported()) {
      startWithBarcodeDetector();
    } else {
      startWithHtml5Qrcode();
    }
  }, [startWithBarcodeDetector, startWithHtml5Qrcode]);

  // ── Retry handler ────────────────────────────
  const handleRetry = useCallback(async () => {
    await releaseCamera();
    setStatus('idle');
    setErrorMessage('');
    // small delay so the DOM settles before re-acquiring
    setTimeout(() => startScanning(), 150);
  }, [releaseCamera, startScanning]);

  // ── Flip camera — hard reset ─────────────────
  //
  // "Could not start video source" on Android is caused by the hardware
  // lens being physically locked by the old stream when the new getUserMedia
  // fires. The fix is a strict, sequential deep-teardown:
  //
  //   Step 1 — Torch wipe (CRITICAL):
  //     If torch is on, applyConstraints({ torch: false }) BEFORE stopping
  //     the track. Some Android drivers process torch state async; stopping
  //     the track while torch is still active leaves the hardware in a bad
  //     state that the next stream then inherits.
  //
  //   Step 2 — Stop the rAF decode loop (BarcodeDetector path).
  //
  //   Step 3 — html5-qrcode stop() + clear() (fallback path).
  //     clear() is mandatory — it removes the library's injected DOM nodes
  //     so the next Html5Qrcode(id) constructor gets a clean element.
  //
  //   Step 4 — Stop every media track individually.
  //
  //   Step 5 — Null out videoElement.srcObject (BarcodeDetector path).
  //     Some WebKit versions hold a reference to the stream via srcObject
  //     even after track.stop(); nulling it forces a full release.
  //
  //   Step 6 — 500ms hardware buffer.
  //     The physical camera sensor needs this to unlock before the OS will
  //     grant a new getUserMedia to the same origin.
  //
  //   Step 7 — startScanning() from scratch with the new facingMode.
  //     This is a full cold-start, not a stream update.
  //
  const handleFlipCamera = useCallback(async () => {
    if (isSwitching) return;

    const next = facingModeRef.current === 'environment' ? 'user' : 'environment';

    // Lock UI immediately — prevents multi-tap races
    setIsSwitching(true);

    // ── Step 1: Torch wipe ──────────────────────
    // Turn off torch BEFORE stopping the track so the driver receives
    // the torch:false command while the track is still live.
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()?.[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ torch: false }] });
        } catch { /* front camera / no torch — ignore */ }
      }
    }
    // Wipe torch state synchronously so startScanning never inherits true
    setTorchOn(false);
    setTorchAvailable(false);

    // ── Step 2: Stop BarcodeDetector rAF loop ──
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // ── Step 3: html5-qrcode stop + clear ──────
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        html5QrRef.current.clear(); // removes injected DOM — mandatory before next init
      } catch { /* already stopped */ }
      html5QrRef.current = null;
    }

    // ── Step 4: Stop every media track ─────────
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // ── Step 5: Null srcObject (WebKit hold fix) ─
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // ── Step 6: 500ms hardware-release buffer ───
    // Write the new facing mode to the ref NOW so startScanning() reads
    // the correct value when the timeout fires.
    facingModeRef.current = next;
    setFacingMode(next);

    setTimeout(() => {
      // ── Step 7: Cold-start with new facingMode ─
      startScanning();
      setIsSwitching(false);
    }, 500);
  }, [isSwitching, startScanning]);

  // ── Torch toggle ─────────────────────────────
  const handleTorchToggle = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch { /* torch not available at runtime */ }
  }, [torchOn]);

  // ── Lifecycle: start on mount, release on unmount ──
  useEffect(() => {
    startScanning();
    return () => {
      releaseCamera();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Lifecycle: release on tab blur, reacquire on focus ──
  useEffect(() => {
    const handleBlur = () => releaseCamera();
    const handleFocus = () => {
      // Only restart if we were actively scanning
      setStatus((prev) => {
        if (prev === 'scanning' || prev === 'starting') {
          setTimeout(() => startScanning(), 150);
        }
        return prev;
      });
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [releaseCamera, startScanning]);

  // ─────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────

  const isLoading = status === 'idle' || status === 'starting';

  return (
    <div
      role="region"
      aria-label="QR code scanner"
      style={styles.wrapper}
    >
      {/* ── Camera viewport ── */}
      <div style={styles.viewportContainer}>

        {/* BarcodeDetector path: native <video> */}
        {isBarcodeDetectorSupported() && (
          <video
            ref={videoRef}
            style={{
              ...styles.video,
              opacity: status === 'scanning' ? 1 : 0,
            }}
            playsInline
            muted
            aria-hidden="true"
          />
        )}

        {/* html5-qrcode path: library manages its own video inside this div */}
        {!isBarcodeDetectorSupported() && (
          <div
            id={HTML5QR_ELEMENT_ID}
            style={{
              ...styles.video,
              opacity: status === 'scanning' ? 1 : 0,
            }}
            aria-hidden="true"
          />
        )}

        {/* Scanning reticle (visible only when actively scanning) */}
        {status === 'scanning' && (
          /* Full-viewport overlay; pointer-events off so touches reach the video */
          <div style={styles.reticleOuter} aria-hidden="true">
            {/* Square box: absolutely centered with translate so hint text doesn't push it */}
            <div style={styles.reticle}>
              {/* Corner marks — anchored to their respective corners of the box */}
              <span style={{ ...styles.corner, top: 0,    left: 0,  borderTopWidth: 3, borderLeftWidth: 3 }} />
              <span style={{ ...styles.corner, top: 0,    right: 0, borderTopWidth: 3, borderRightWidth: 3 }} />
              <span style={{ ...styles.corner, bottom: 0, left: 0,  borderBottomWidth: 3, borderLeftWidth: 3 }} />
              <span style={{ ...styles.corner, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }} />
              {/* Animated sweep line — bounded inside the box */}
              <div style={styles.sweepLine} />
            </div>
            {/* Hint text: absolutely positioned just below the box */}
            <p style={styles.reticleHint}>Align QR code within the frame</p>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div style={styles.overlay} role="status" aria-live="polite">
            <Spinner color={TOKEN.primary} />
            <p style={{ ...styles.overlayText, color: TOKEN.body }}>
              {status === 'idle' ? 'Preparing camera…' : 'Starting camera…'}
            </p>
          </div>
        )}

        {/* ── Error: permission denied ── */}
        {status === 'denied' && (
          <div style={styles.overlay} role="alert">
            <CameraOffIcon color={TOKEN.error} />
            <h2 style={{ ...styles.errorHeading, color: TOKEN.heading }}>
              Camera Access Denied
            </h2>
            <p style={{ ...styles.errorBody, color: TOKEN.body }}>
              Please allow camera access in your browser settings and try again.
            </p>
            <button
              style={styles.retryButton}
              onClick={handleRetry}
              aria-label="Retry camera access"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Error: generic ── */}
        {status === 'error' && (
          <div style={styles.overlay} role="alert">
            <CameraOffIcon color={TOKEN.error} />
            <h2 style={{ ...styles.errorHeading, color: TOKEN.heading }}>
              Camera Error
            </h2>
            <p style={{ ...styles.errorBody, color: TOKEN.error }}>
              {errorMessage}
            </p>
            <button
              style={styles.retryButton}
              onClick={handleRetry}
              aria-label="Retry camera"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* ── Camera controls: below the scanner, always in document flow ── */}
      {status === 'scanning' && (
        <div
          className="flex flex-row justify-center items-center gap-6 mt-6 w-full"
          aria-label="Camera controls"
        >
          {/* Flip camera — icon only, no label */}
          <button
            className={[
              'flex items-center justify-center bg-white/10 text-white p-3 rounded-full backdrop-blur-sm transition-all focus:outline-none focus:ring-2 focus:ring-white/40',
              isSwitching
                ? 'opacity-40 cursor-not-allowed'
                : 'hover:bg-white/20 active:scale-95',
            ].join(' ')}
            onClick={handleFlipCamera}
            disabled={isSwitching}
            aria-label={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}
            aria-busy={isSwitching}
          >
            {isSwitching
              ? <Spinner color="#ffffff" size={20} />
              : <FlipCameraIcon size={20} />
            }
          </button>

          {/* Torch toggle — only rendered when hardware supports it */}
          {torchAvailable && (
            <button
              className={[
                'flex flex-col items-center gap-1 px-5 py-3 rounded-full backdrop-blur-sm active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-white/40',
                torchOn
                  ? 'bg-[#7E57C2] text-white hover:bg-[#6a48a8]'
                  : 'bg-white/10 text-white hover:bg-white/20',
              ].join(' ')}
              onClick={handleTorchToggle}
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
            >
              <FlashlightIcon size={20} />
              <span className="text-xs font-medium tracking-wide">
                {torchOn ? 'Flash On' : 'Flash Off'}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Inline styles
// (avoids Tailwind dependency for a portable component)
// ─────────────────────────────────────────────
const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#000',
    position: 'relative',
    borderRadius: '0.75rem',
    paddingBottom: '1.25rem',
  },
  viewportContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    maxWidth: 480,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.3s ease',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: '1.5rem',
    gap: '0.75rem',
  },
  overlayText: {
    fontSize: '0.875rem',
    margin: 0,
  },
  errorHeading: {
    fontSize: '1.125rem',
    fontWeight: 700,
    margin: 0,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: '0.875rem',
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  retryButton: {
    marginTop: '0.5rem',
    padding: '0.625rem 1.5rem',
    borderRadius: '9999px',
    border: 'none',
    backgroundColor: TOKEN.primary,
    color: '#ffffff',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    letterSpacing: '0.02em',
  },
  reticleOuter: {
    // Full-bleed absolute overlay — does NOT participate in flex layout
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  reticle: {
    // Centered purely with top/left + translate so the hint text below
    // never shifts the box upward
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: SCAN_QR_BOX_PX,
    height: SCAN_QR_BOX_PX,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: TOKEN.primary,
    borderStyle: 'solid',
    borderWidth: 0,
  },
  sweepLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    height: 2,
    backgroundColor: TOKEN.primary,
    opacity: 0.85,
    animation: 'qrSweep 2s linear infinite',
    borderRadius: 1,
  },
  reticleHint: {
    // Sits immediately below the reticle box, still within the viewport container
    position: 'absolute',
    top: `calc(50% + ${SCAN_QR_BOX_PX / 2}px + 12px)`,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: '0.03em',
    margin: 0,
  },
};

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function Spinner({ color, size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'spin 0.9s linear infinite' }}
    >
      <circle cx={20} cy={20} r={16} stroke="rgba(255,255,255,0.15)" strokeWidth={4} />
      <path
        d="M20 4 A16 16 0 0 1 36 20"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
}

function CameraOffIcon({ color }) {
  return (
    <svg
      width={48}
      height={48}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 1l22 22" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h3a2 2 0 0 1 2 2v9.34" />
      <circle cx={12} cy={13} r={3} />
    </svg>
  );
}

function FlashlightIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function FlipCameraIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
    </svg>
  );
}

// ─────────────────────────────────────────────
// Style injection (once, at module load)
// Keyframes for animations + global override for html5-qrcode's injected
// inline styles that cause black bars and layout offsets.
// ─────────────────────────────────────────────
(function injectStyles() {
  if (typeof document === 'undefined') return;
  const id = 'qr-scanner-styles';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    /* ── Keyframes ── */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes qrSweep {
      0%   { top: 8px;  opacity: 0.9; }
      50%  { opacity: 0.5; }
      100% { top: calc(100% - 10px); opacity: 0.9; }
    }

    /* ── html5-qrcode overrides ──────────────────────────────────────────
       The library injects a <div id="reader"> with inline border, padding,
       and a fixed-size inner box. These rules strip those so our container
       controls the dimensions and the video fills it edge-to-edge.
    ─────────────────────────────────────────────────────────────────── */
    #${HTML5QR_ELEMENT_ID} {
      border: none !important;
      padding: 0 !important;
      position: relative !important;
      overflow: hidden !important;
      width: 100% !important;
      height: 100% !important;
    }
    /* The library's inner scanning region box — remove its own border overlay */
    #${HTML5QR_ELEMENT_ID} > div {
      border: none !important;
      box-shadow: none !important;
    }
    /* Force the injected <video> to cover the container without black bars */
    #${HTML5QR_ELEMENT_ID} video {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      position: absolute !important;
      inset: 0 !important;
    }
    /* Hide the library's own anchor/shading overlay elements */
    #${HTML5QR_ELEMENT_ID} img,
    #${HTML5QR_ELEMENT_ID} #qr-shaded-region {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
})();

export default QRScanner;

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { markOnboardingComplete } from './gateSetupStorage.js';
import { useInstallPrompt } from './useInstallPrompt.js';
import styles from './GateSetupScreen.module.css';

/**
 * GateSetupScreen — A4 one-time device onboarding.
 *
 * Steps rendered in-place (no routing):
 *   welcome  → camera  → install (if available) → done
 *
 * Props:
 *   staffId    — string  — used to key onboarding persistence
 *   name       — string  — staff member's name
 *   eventName  — string  — event name (may be undefined)
 *   gate       — string  — gate assignment
 *   onComplete — (cameraPermission: 'granted'|'denied'|'prompt') => void
 *                Called when onboarding finishes. Caller proceeds to StaffAppShell.
 */
export default function GateSetupScreen({ staffId, name, eventName, gate, onComplete }) {
  const [step, setStep]                     = useState('welcome'); // welcome | camera | install
  const [cameraPermission, setCameraPermission] = useState('prompt');
  const [cameraRequesting, setCameraRequesting] = useState(false);
  const [installChoice, setInstallChoice]     = useState(null); // null | 'accepted' | 'dismissed' | 'never'
  const [isDesktop, setIsDesktop]             = useState(() => !('ontouchstart' in window) && window.innerWidth >= 768);

  const { installPrompt, triggerInstall, clearPrompt } = useInstallPrompt();

  // ── Helpers ──────────────────────────────────────────────────────────────

  const finish = (camPerm) => {
    markOnboardingComplete(staffId, camPerm);
    onComplete(camPerm);
  };

  // ── Step: Welcome → Camera ────────────────────────────────────────────────
  const handleContinue = () => setStep('camera');

  // ── Step: Camera permission request ──────────────────────────────────────
  const requestCamera = async () => {
    setCameraRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      // Stop the stream immediately — we only needed the permission grant
      stream.getTracks().forEach((t) => t.stop());
      setCameraPermission('granted');
      proceedAfterCamera('granted');
    } catch {
      setCameraPermission('denied');
      proceedAfterCamera('denied');
    } finally {
      setCameraRequesting(false);
    }
  };

  const proceedAfterCamera = (camPerm) => {
    if (installPrompt) {
      setStep('install');
    } else {
      finish(camPerm);
    }
  };

  const skipCamera = () => {
    setCameraPermission('prompt');
    if (installPrompt) {
      setStep('install');
    } else {
      finish('prompt');
    }
  };

  // ── Step: Install prompt ──────────────────────────────────────────────────
  const handleInstall = async () => {
    const outcome = await triggerInstall();
    setInstallChoice(outcome);
    finish(cameraPermission);
  };

  const handleSkipInstall = () => {
    clearPrompt();
    setInstallChoice('dismissed');
    finish(cameraPermission);
  };

  const handleNeverInstall = () => {
    clearPrompt();
    setInstallChoice('never');
    finish(cameraPermission);
  };

  // ── Variants ──────────────────────────────────────────────────────────────
  const slideIn = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: -24 },
  };
  const transition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.screen}>
      {/* Desktop informational banner — non-blocking */}
      {isDesktop && (
        <div className={styles.desktopBanner} role="note">
          <span className={styles.desktopBannerIcon} aria-hidden="true">💻</span>
          Camera scanning works best on a mobile device. Manual lookup remains available.
        </div>
      )}

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoWrap} aria-hidden="true">
          <div className={styles.logo}>X</div>
        </div>

        <AnimatePresence mode="wait">

          {/* ── STEP: welcome ── */}
          {step === 'welcome' && (
            <motion.div key="welcome" variants={slideIn} initial="initial"
              animate="animate" exit="exit" transition={transition}
              className={styles.stepBody}
            >
              <h1 className={styles.title}>
                Welcome, {name || 'Staff'}.
              </h1>
              <p className={styles.subtitle}>
                You're checking in guests
                {eventName ? ` at ${eventName}` : ''}
                {gate ? ` at ${gate}` : ''}.
              </p>

              {/* Assignment summary card */}
              <div className={styles.assignmentCard} aria-label="Your gate assignment">
                {eventName && (
                  <div className={styles.assignmentRow}>
                    <span className={styles.assignmentLabel}>Event</span>
                    <span className={styles.assignmentValue}>{eventName}</span>
                  </div>
                )}
                {gate && (
                  <div className={styles.assignmentRow}>
                    <span className={styles.assignmentLabel}>Gate</span>
                    <span className={styles.assignmentValue}>{gate}</span>
                  </div>
                )}
                {name && (
                  <div className={styles.assignmentRow}>
                    <span className={styles.assignmentLabel}>Staff</span>
                    <span className={styles.assignmentValue}>{name}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleContinue}
                className={styles.primaryButton}
                autoFocus
              >
                Continue
              </button>
            </motion.div>
          )}

          {/* ── STEP: camera ── */}
          {step === 'camera' && (
            <motion.div key="camera" variants={slideIn} initial="initial"
              animate="animate" exit="exit" transition={transition}
              className={styles.stepBody}
            >
              <div className={styles.stepIconWrap} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className={styles.stepIcon}>
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>

              <h1 className={styles.title}>Enable camera</h1>
              <p className={styles.subtitle}>
                Camera access lets you scan QR codes instantly.
                You can always check in guests manually if preferred.
              </p>

              <button
                type="button"
                onClick={requestCamera}
                disabled={cameraRequesting}
                className={styles.primaryButton}
                autoFocus
              >
                {cameraRequesting ? (
                  <span className={styles.spinnerRow}>
                    <svg className={styles.spinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" opacity="0.25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity="0.8" />
                    </svg>
                    Requesting…
                  </span>
                ) : (
                  'Allow Camera Access'
                )}
              </button>

              <button
                type="button"
                onClick={skipCamera}
                className={styles.ghostButton}
              >
                Skip — I'll check in manually
              </button>
            </motion.div>
          )}

          {/* ── STEP: install ── */}
          {step === 'install' && (
            <motion.div key="install" variants={slideIn} initial="initial"
              animate="animate" exit="exit" transition={transition}
              className={styles.stepBody}
            >
              <div className={styles.stepIconWrap} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  className={styles.stepIcon}>
                  <path d="M12 2v13M8 11l4 4 4-4" />
                  <path d="M20 17v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
                </svg>
              </div>

              <h1 className={styles.title}>Add to home screen</h1>
              <p className={styles.subtitle}>
                Add ExplaraX Check-in to your home screen for faster access at the gate.
              </p>

              <button
                type="button"
                onClick={handleInstall}
                className={styles.primaryButton}
                autoFocus
              >
                Install App
              </button>

              <button
                type="button"
                onClick={handleSkipInstall}
                className={styles.ghostButton}
              >
                Maybe Later
              </button>

              <button
                type="button"
                onClick={handleNeverInstall}
                className={styles.textButton}
              >
                Don't ask again
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

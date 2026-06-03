import { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import styles from './Modal.module.css';

/**
 * Modal — base shell for all dialog overlays
 *
 * Props:
 *   children  — ReactNode (modal body content)
 *   onClose   — () => void (called on Escape key or backdrop click)
 *   title     — string (optional; renders as <h2 id="modal-title">)
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function Modal({ children, onClose, title }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Store the element that had focus before the modal opened
    const previouslyFocusedElement = document.activeElement;

    // Focus the first focusable element inside the dialog
    const focusableElements = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab: if focus is on or before the first element, wrap to last
          if (document.activeElement === first || !dialog.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: if focus is on or after the last element, wrap to first
          if (document.activeElement === last || !dialog.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the element that triggered the modal
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    };
  }, [onClose]);

  function handleBackdropClick(e) {
    // Only close if clicking directly on the backdrop, not on modal content
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return ReactDOM.createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className={styles.dialog}
      >
        {title && (
          <h2 id="modal-title" className={styles.title}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export default Modal;

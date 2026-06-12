/**
 * Toast — slim notification bar that slides in from the top.
 * Purely presentational; visibility is driven by a prop.
 */

import styles from './Toast.module.css';

/**
 * @param {{ message: string, type: 'success' | 'error', onDismiss: () => void }} props
 */
function Toast({ message, type = 'success', onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`${styles.toast} ${type === 'error' ? styles.error : styles.success}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {type === 'error' ? '✕' : '✓'}
      </span>
      <span className={styles.message}>{message}</span>
      <button
        className={styles.close}
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export default Toast;

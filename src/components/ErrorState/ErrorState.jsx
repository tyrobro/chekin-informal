import Button from '../Button/Button.jsx';
import styles from './ErrorState.module.css';

/**
 * ErrorState — reusable error display component
 *
 * Props:
 *   message  — string   Error message to display
 *   onRetry  — () => void  Called when the user clicks "Retry"
 */
function ErrorState({ message, onRetry }) {
  return (
    <div className={styles.container}>
      <p className={styles.message}>{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

export default ErrorState;

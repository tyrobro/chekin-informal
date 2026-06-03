import styles from './AccessDenied.module.css';

/**
 * AccessDenied — stateless presentational component
 *
 * Rendered by Dashboard when AUTH_FLAG is false.
 * Requirements: 1.3
 */
function AccessDenied() {
  return (
    <div className={styles.container} role="alert">
      <h1 className={styles.heading}>Access Denied</h1>
      <p className={styles.message}>
        You do not have permission to view this page.
      </p>
    </div>
  );
}

export default AccessDenied;

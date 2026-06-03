import styles from './Button.module.css';

/**
 * Button — reusable UI atom
 *
 * Props:
 *   variant   — 'primary' | 'secondary' | 'danger'  (default: 'primary')
 *   disabled  — boolean
 *   onClick   — () => void
 *   children  — ReactNode
 *   ariaLabel — string (optional, for icon-only or supplementary labels)
 */
function Button({
  variant = 'primary',
  disabled = false,
  onClick,
  children,
  ariaLabel,
}) {
  const variantClass = {
    primary: styles.primary,
    secondary: styles.secondary,
    danger: styles.danger,
  }[variant] ?? styles.primary;

  return (
    <button
      className={`${styles.btn} ${variantClass}`}
      disabled={disabled}
      aria-disabled={disabled ? 'true' : undefined}
      aria-label={ariaLabel}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </button>
  );
}

export default Button;

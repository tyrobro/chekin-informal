import styles from './ProgressBar.module.css';

/**
 * ProgressBar — reusable progress indicator atom.
 *
 * @param {object} props
 * @param {number}  props.percent  - Fill percentage, 0–100
 * @param {boolean} props.frozen   - When true (error state), disables the width transition
 * @param {string}  props.label    - Accessible aria-label for the progress bar
 */
export default function ProgressBar({ percent, frozen, label }) {
  const fillClass = [styles.fill, frozen ? styles.frozen : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={fillClass}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

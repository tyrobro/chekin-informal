import styles from './VerificationPolicySelector.module.css';

/**
 * VerificationPolicySelector — controlled radio-group for verification policy.
 *
 * Props:
 *   selected  — VerificationPolicy value currently selected
 *   onChange  — (policy: VerificationPolicy) => void
 */

const POLICIES = [
  { value: 'both',         label: 'Both (recommended)',   description: 'Gate staff verify by Ticket ID and ID Document' },
  { value: 'mode_a_only',  label: 'Mode A only',          description: 'Manual verification by Ticket ID' },
  { value: 'mode_b_only',  label: 'Mode B only',          description: 'Manual verification by ID Document' },
  { value: 'qr_only',      label: 'Neither (QR only)',    description: 'QR scan only — no manual fallback' },
];

function VerificationPolicySelector({ selected, onChange }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend} id="policy-legend">
        Verification Policy
      </legend>
      <p
        id="policy-description"
        className={styles.description}
        aria-describedby="policy-legend"
      >
        Choose how gate staff will verify attendees manually.
      </p>
      <div className={styles.options}>
        {POLICIES.map((policy) => (
          <label key={policy.value} className={styles.option}>
            <input
              type="radio"
              name="verification-policy"
              value={policy.value}
              checked={selected === policy.value}
              onChange={() => onChange(policy.value)}
              className={styles.radio}
            />
            <span className={styles.labelText}>{policy.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default VerificationPolicySelector;

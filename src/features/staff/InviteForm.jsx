/**
 * InviteForm — Staff invitation form (Name, Email, Gate).
 *
 * Calls onSubmit({ name, email, gate }) and resets on success.
 * Client-side validation only — server errors surface via the toast in the parent.
 */

import { useState } from 'react';
import styles from './InviteForm.module.css';

const EMPTY = { name: '', email: '', gate: '' };

/**
 * @param {{ onSubmit: (values) => Promise<boolean>, isSubmitting: boolean }} props
 */
function InviteForm({ onSubmit, isSubmitting }) {
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear individual field error on edit
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  }

  function validate() {
    const errors = {};
    if (!values.name.trim())  errors.name  = 'Name is required';
    if (!values.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errors.email = 'Enter a valid email address';
    }
    if (!values.gate.trim())  errors.gate  = 'Gate assignment is required';
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    const success = await onSubmit(values);
    if (success) setValues(EMPTY);
  }

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Invite check-in staff"
    >
      <h2 className={styles.heading}>Invite Staff Member</h2>

      <div className={styles.fields}>
        {/* Name */}
        <div className={styles.fieldGroup}>
          <label htmlFor="staff-name" className={styles.label}>
            Full Name
          </label>
          <input
            id="staff-name"
            name="name"
            type="text"
            className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
            placeholder="e.g. Priya Sharma"
            value={values.name}
            onChange={handleChange}
            autoComplete="name"
            disabled={isSubmitting}
            aria-describedby={fieldErrors.name ? 'err-name' : undefined}
          />
          {fieldErrors.name && (
            <span id="err-name" className={styles.errorMsg} role="alert">
              {fieldErrors.name}
            </span>
          )}
        </div>

        {/* Email */}
        <div className={styles.fieldGroup}>
          <label htmlFor="staff-email" className={styles.label}>
            Email Address
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
            placeholder="e.g. priya@example.com"
            value={values.email}
            onChange={handleChange}
            autoComplete="email"
            disabled={isSubmitting}
            aria-describedby={fieldErrors.email ? 'err-email' : undefined}
          />
          {fieldErrors.email && (
            <span id="err-email" className={styles.errorMsg} role="alert">
              {fieldErrors.email}
            </span>
          )}
        </div>

        {/* Gate assignment */}
        <div className={styles.fieldGroup}>
          <label htmlFor="staff-gate" className={styles.label}>
            Gate Assignment
          </label>
          <input
            id="staff-gate"
            name="gate"
            type="text"
            className={`${styles.input} ${fieldErrors.gate ? styles.inputError : ''}`}
            placeholder='e.g. "Main Gate", "VIP Entrance", or "Any Gate"'
            value={values.gate}
            onChange={handleChange}
            disabled={isSubmitting}
            aria-describedby={fieldErrors.gate ? 'err-gate' : undefined}
          />
          {fieldErrors.gate && (
            <span id="err-gate" className={styles.errorMsg} role="alert">
              {fieldErrors.gate}
            </span>
          )}
        </div>
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Sending invite…' : 'Send Invite'}
      </button>
    </form>
  );
}

export default InviteForm;

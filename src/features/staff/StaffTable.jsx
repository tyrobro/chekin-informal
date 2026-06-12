/**
 * StaffTable — displays the staff list with status chips and contextual actions.
 *
 * Status rules:
 *   token_used_at === null  → "Invited"   → actions: Resend, Copy Link
 *   token_used_at !== null  → "Active"    → action:  Revoke
 *
 * Revoked rows stay visible (greyed) so the host has a full audit trail.
 */

import styles from './StaffTable.module.css';

/**
 * @param {{
 *   staff: StaffMember[],
 *   onRevoke:   (id: string) => void,
 *   onResend:   (id: string) => void,
 *   onCopyLink: (token: string) => void,
 * }} props
 */
function StaffTable({ staff, onRevoke, onResend, onCopyLink }) {
  if (staff.length === 0) {
    return (
      <div className={styles.empty} role="status">
        No staff invited yet. Use the form above to send the first invite.
      </div>
    );
  }

  return (
    <div className={styles.tableWrapper} role="region" aria-label="Staff list">
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th} scope="col">Name</th>
            <th className={styles.th} scope="col">Email</th>
            <th className={styles.th} scope="col">Gate</th>
            <th className={styles.th} scope="col">Status</th>
            <th className={styles.th} scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => {
            const isActive  = member.token_used_at !== null;
            const isRevoked = member.revoked === true;

            return (
              <tr
                key={member.id}
                className={`${styles.tr} ${isRevoked ? styles.revokedRow : ''}`}
              >
                {/* Name */}
                <td className={styles.td}>
                  <span className={styles.name}>{member.name}</span>
                </td>

                {/* Email */}
                <td className={styles.td}>
                  <span className={styles.email}>{member.email}</span>
                </td>

                {/* Gate — free-form text */}
                <td className={styles.td}>
                  <span className={styles.gate}>{member.gate || '—'}</span>
                </td>

                {/* Status chip */}
                <td className={styles.td}>
                  {isRevoked ? (
                    <span className={styles.chipRevoked}>Revoked</span>
                  ) : isActive ? (
                    <span className={styles.chipActive}>Active</span>
                  ) : (
                    <span className={styles.chipInvited}>Invited</span>
                  )}
                </td>

                {/* Actions */}
                <td className={styles.td}>
                  {isRevoked ? (
                    <span className={styles.noAction}>—</span>
                  ) : isActive ? (
                    <button
                      className={styles.btnDanger}
                      onClick={() => onRevoke(member.id)}
                      aria-label={`Revoke access for ${member.name}`}
                    >
                      Revoke
                    </button>
                  ) : (
                    <div className={styles.actionGroup}>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => onResend(member.id)}
                        aria-label={`Resend invite to ${member.name}`}
                      >
                        Resend
                      </button>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => onCopyLink(member.invite_token)}
                        aria-label={`Copy invite link for ${member.name}`}
                      >
                        Copy Link
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default StaffTable;

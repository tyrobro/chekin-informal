/**
 * VerificationPolicySelector — controlled radio-group for verification policy.
 *
 * Props:
 *   selected  — VerificationPolicy value currently selected
 *   onChange  — (policy: VerificationPolicy) => void
 *
 * All logic unchanged; only markup and Tailwind classes updated.
 */

const POLICIES = [
  { value: 'both',        label: 'Both (recommended)',  description: 'Gate staff verify by Ticket ID and ID Document' },
  { value: 'mode_a_only', label: 'Mode A only',         description: 'Manual verification by Ticket ID' },
  { value: 'mode_b_only', label: 'Mode B only',         description: 'Manual verification by ID Document' },
  { value: 'qr_only',     label: 'Neither (QR only)',   description: 'QR scan only — no manual fallback' },
];

function VerificationPolicySelector({ selected, onChange }) {
  return (
    <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
      <legend className="px-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">
        Verification Policy
      </legend>
      <p
        id="policy-description"
        className="text-xs text-slate-400 -mt-1 mb-1"
        aria-describedby="policy-legend"
      >
        Choose how gate staff will verify attendees manually.
      </p>
      <div className="space-y-2">
        {POLICIES.map((policy) => {
          const isSelected = selected === policy.value;
          return (
            <label
              key={policy.value}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer
                          transition-all duration-150 select-none
                          ${isSelected
                            ? 'bg-indigo-50 border-indigo-300 ring-1 ring-indigo-300'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <input
                type="radio"
                name="verification-policy"
                value={policy.value}
                checked={isSelected}
                onChange={() => onChange(policy.value)}
                className="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
              />
              <div className="space-y-0.5">
                <span className={`block text-sm font-semibold leading-none
                                  ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>
                  {policy.label}
                </span>
                <span className="block text-xs text-slate-500 leading-snug">
                  {policy.description}
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default VerificationPolicySelector;

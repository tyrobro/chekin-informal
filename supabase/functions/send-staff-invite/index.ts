/**
 * supabase/functions/send-staff-invite/index.ts
 *
 * Deno Edge Function — sends a staff check-in invite email via Resend.
 *
 * Expected POST body (JSON):
 *   {
 *     name:        string  — recipient's display name
 *     email:       string  — recipient's email address
 *     gate:        string  — gate assignment (e.g. "Gate A")
 *     inviteToken: string  — the magic-link token stored in checkin_staff.token
 *   }
 *
 * Required secret (set via `supabase secrets set RESEND_API_KEY=...`):
 *   RESEND_API_KEY
 *
 * Deploy:
 *   supabase functions deploy send-staff-invite
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ─────────────────────────────────────────────────────────────────────────────
// CORS — allow requests from the React PWA and local dev
// ─────────────────────────────────────────────────────────────────────────────
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

// ─────────────────────────────────────────────────────────────────────────────
// HTML email template
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailHtml(name: string, gate: string, magicLink: string): string {
  // Values are rendered inside quoted HTML attributes or text nodes only —
  // no user input is injected into script contexts or event handlers.
  const escapedName = htmlEscape(name);
  const escapedGate = htmlEscape(gate);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Staff Invite — ExplaraX</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
               style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header bar -->
          <tr>
            <td style="background:#7E57C2;padding:28px 32px;">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);">
                ExplaraX Check-In
              </p>
              <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3;">
                You're invited to staff an event
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">

              <p style="margin:0 0 20px;font-size:15px;color:#3B3535;line-height:1.6;">
                Hi <strong>${escapedName}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#3B3535;line-height:1.6;">
                You've been assigned as a check-in staff member for an upcoming event.
                Your gate assignment is:
              </p>

              <!-- Gate badge -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#EDE9F8;border-radius:8px;padding:10px 20px;">
                    <span style="font-size:16px;font-weight:700;color:#7E57C2;">${escapedGate}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:15px;color:#3B3535;line-height:1.6;">
                Tap the button below on your mobile device to open the check-in scanner.
                This link is unique to you — do not share it.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0;">
                <tr>
                  <td style="border-radius:10px;background:#7E57C2;">
                    <a href="${magicLink}"
                       target="_blank"
                       rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;
                              color:#ffffff;text-decoration:none;letter-spacing:0.02em;">
                      Open Check-In Scanner →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="margin:0 0 8px;font-size:12px;color:#888;line-height:1.5;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:12px;color:#7E57C2;word-break:break-all;line-height:1.5;">
                <a href="${magicLink}" style="color:#7E57C2;">${magicLink}</a>
              </p>

              <hr style="border:none;border-top:1px solid #eee;margin:0 0 24px;" />

              <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
                This invite was sent by the ExplaraX event management platform.
                If you were not expecting this email, you can safely ignore it.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9f9fb;padding:16px 32px;border-top:1px solid #eee;">
              <p style="margin:0;font-size:11px;color:#bbb;text-align:center;">
                © ExplaraX · checkin.explarax.com
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal HTML escaping — prevents stored-XSS if name/gate contain markup
// ─────────────────────────────────────────────────────────────────────────────
function htmlEscape(str: string): string {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Request handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {

  // ── CORS preflight ──────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { name?: unknown; email?: unknown; gate?: unknown; inviteToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { name, email, gate, inviteToken } = body;

  // ── Input validation ────────────────────────────────────────────────────
  if (
    typeof name        !== 'string' || !name.trim()        ||
    typeof email       !== 'string' || !email.trim()       ||
    typeof gate        !== 'string' || !gate.trim()        ||
    typeof inviteToken !== 'string' || !inviteToken.trim()
  ) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid fields: name, email, gate, inviteToken are all required.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // ── Env var ─────────────────────────────────────────────────────────────
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('send-staff-invite: RESEND_API_KEY secret is not set.');
    return new Response(JSON.stringify({ error: 'Email service is not configured.' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Build magic link ────────────────────────────────────────────────────
  const magicLink =
    `https://checkin.explarax.com/staff?token=${encodeURIComponent(inviteToken)}`;

  // ── Send via Resend REST API ────────────────────────────────────────────
  let resendRes: Response;
  try {
    resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'ExplaraX Check-In <onboarding@resend.dev>',
        to:      [email.trim()],
        subject: "You've been invited to staff an event!",
        html:    buildEmailHtml(name.trim(), gate.trim(), magicLink),
      }),
    });
  } catch (networkErr) {
    console.error('send-staff-invite: network error calling Resend —', networkErr);
    return new Response(JSON.stringify({ error: 'Failed to reach email service.' }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Forward Resend response ─────────────────────────────────────────────
  const resendData = await resendRes.json();

  if (!resendRes.ok) {
    console.error('send-staff-invite: Resend returned error —', resendRes.status, resendData);
    return new Response(JSON.stringify({ error: 'Email send failed.', detail: resendData }), {
      status: resendRes.status >= 500 ? 502 : 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(resendData), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

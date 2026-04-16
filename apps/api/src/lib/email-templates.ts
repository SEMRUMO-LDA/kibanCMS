/**
 * Email Templates — Clean inline-CSS HTML
 *
 * All styles inline for maximum email client compatibility.
 * Single-column layout, max-width 600px, no external images.
 */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(body: string, siteName: string): string {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#2c2c2c;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #eee;">
          <strong style="font-size:16px;color:#1a1a1a;">${escapeHtml(siteName)}</strong>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #eee;font-size:12px;color:#999;">
          Enviado por ${escapeHtml(siteName)} via kibanCMS
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Form Notification (to admin) ──

export function formNotificationTemplate(
  formName: string,
  content: Record<string, any>,
  entryId: string,
  siteName: string,
): { html: string } {
  const fields = [
    { label: 'Formulário', value: formName },
    { label: 'Nome', value: content.name },
    { label: 'Email', value: content.email },
    { label: 'Telefone', value: content.phone },
    { label: 'Assunto', value: content.subject },
    { label: 'Mensagem', value: content.message },
    { label: 'Página', value: content.source_url },
    { label: 'Data', value: content.submitted_at ? new Date(content.submitted_at).toLocaleString('pt-PT') : '' },
  ].filter(f => f.value);

  let rows = '';
  for (const f of fields) {
    const isMessage = f.label === 'Mensagem';
    rows += `<tr>
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#888;vertical-align:top;width:100px;border-bottom:1px solid #f5f5f5;">${escapeHtml(f.label)}</td>
      <td style="padding:10px 12px;font-size:14px;color:#2c2c2c;border-bottom:1px solid #f5f5f5;${isMessage ? 'white-space:pre-wrap;' : ''}">${escapeHtml(f.value)}</td>
    </tr>`;
  }

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;">Nova submissão de formulário:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;">
      ${rows}
    </table>
  `;

  return { html: layout(body, siteName) };
}

// ── Form Auto-Reply (to visitor) ──

export function formAutoReplyTemplate(
  formName: string,
  visitorName: string,
  autoReplyMessage: string,
  siteName: string,
): { subject: string; html: string } {
  const greeting = visitorName ? `Olá ${escapeHtml(visitorName)},` : 'Olá,';

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;">${greeting}</p>
    <p style="margin:0 0 24px;font-size:15px;color:#2c2c2c;white-space:pre-wrap;">${escapeHtml(autoReplyMessage)}</p>
    <p style="margin:0;font-size:14px;color:#888;">— ${escapeHtml(siteName)}</p>
  `;

  return {
    subject: `Recebemos a sua mensagem — ${siteName}`,
    html: layout(body, siteName),
  };
}

// ── Booking Confirmation (to customer) ──

export function bookingConfirmationTemplate(
  booking: Record<string, any>,
  siteName: string,
): { subject: string; html: string } {
  const name = booking.customer_name || '';
  const greeting = name ? `Olá ${escapeHtml(name)},` : 'Olá,';

  const details = [
    { label: 'Experiência', value: booking.tour_name || booking.tour_slug },
    { label: 'Data', value: booking.date },
    { label: 'Horário', value: booking.time_slot },
    { label: 'Adultos', value: booking.adults?.toString() },
    { label: 'Crianças', value: booking.children ? booking.children.toString() : '' },
    { label: 'Total', value: booking.total_amount ? `${booking.total_amount}€` : '' },
  ].filter(f => f.value);

  let rows = '';
  for (const d of details) {
    rows += `<tr>
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#888;width:110px;border-bottom:1px solid #f5f5f5;">${escapeHtml(d.label)}</td>
      <td style="padding:8px 12px;font-size:14px;color:#2c2c2c;border-bottom:1px solid #f5f5f5;">${escapeHtml(d.value)}</td>
    </tr>`;
  }

  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#2c2c2c;">${greeting}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#2c2c2c;">A sua reserva foi confirmada com sucesso.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      ${rows}
    </table>
    <p style="margin:0;font-size:14px;color:#888;">Se tiver alguma questão, não hesite em contactar-nos.</p>
    <p style="margin:12px 0 0;font-size:14px;color:#888;">— ${escapeHtml(siteName)}</p>
  `;

  return {
    subject: `Reserva confirmada — ${siteName}`,
    html: layout(body, siteName),
  };
}

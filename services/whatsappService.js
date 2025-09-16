const fetchFn = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const formatPhoneE164 = (phone, defaultCountryCode = '+91') => {
  try {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 11) return `${defaultCountryCode}${digits.slice(1)}`;
    if (digits.length === 10) return `${defaultCountryCode}${digits}`;
    if (digits.startsWith('+' )) return digits;
    return `+${digits}`;
  } catch (e) {
    return null;
  }
};

const sendWhatsAppText = async ({ phone, message }) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      console.warn('WhatsApp config missing: WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
      return { skipped: true, reason: 'missing_config' };
    }

    const to = formatPhoneE164(phone);
    if (!to) {
      console.warn('Invalid phone for WhatsApp:', phone);
      return { skipped: true, reason: 'invalid_phone' };
    }

    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message }
    };

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('WhatsApp send failed:', response.status, errText);
      return { ok: false, status: response.status, error: errText };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return { ok: false, error: error.message };
  }
};

module.exports = {
  sendWhatsAppText,
  formatPhoneE164
};



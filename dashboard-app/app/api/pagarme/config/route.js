export async function GET() {
  const secretConfigured = Boolean(process.env.PAGARME_SECRET_KEY);
  const publicKey = process.env.PAGARME_PUBLIC_KEY || '';

  return Response.json({
    pixAvailable: secretConfigured,
    cardAvailable: secretConfigured && Boolean(publicKey),
    savedCardAvailable: secretConfigured,
    voucherAvailable: secretConfigured && Boolean(publicKey) && process.env.PAGARME_VOUCHER_ENABLED === 'true',
    publicKey: secretConfigured ? publicKey : '',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

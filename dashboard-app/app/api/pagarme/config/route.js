export async function GET() {
  const secretConfigured = Boolean(process.env.PAGARME_SECRET_KEY);
  const publicKey = process.env.PAGARME_PUBLIC_KEY || '';

  return Response.json({
    pixAvailable: secretConfigured,
    cardAvailable: secretConfigured && Boolean(publicKey),
    savedCardAvailable: secretConfigured,
    publicKey: secretConfigured ? publicKey : '',
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

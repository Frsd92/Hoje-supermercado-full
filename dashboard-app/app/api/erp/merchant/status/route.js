import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { getGoogleMerchantConfig } from '@/features/erp/api/google-merchant';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  const config = getGoogleMerchantConfig();
  return Response.json({
    configured: config.missing.length === 0,
    automaticSyncConfigured: Boolean(process.env.CRON_SECRET),
    missing: config.missing,
    accountId: config.accountId,
    dataSource: config.dataSource,
  }, { headers });
}

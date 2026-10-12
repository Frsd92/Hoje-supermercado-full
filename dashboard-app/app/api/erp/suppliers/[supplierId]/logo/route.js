import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const { supplierId } = await params;
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { logoData: true, logoMimeType: true },
    });
    if (!supplier?.logoData || !['image/webp', 'image/png', 'image/jpeg'].includes(supplier.logoMimeType)) {
      return Response.json({ error: 'Logo do fornecedor não encontrada.' }, { status: 404 });
    }
    const match = supplier.logoData.match(/^data:image\/(?:webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) {
      console.error('Logo persistida do fornecedor está em formato inválido:', supplierId);
      return Response.json({ error: 'Não foi possível carregar a logo do fornecedor.' }, { status: 500 });
    }
    const imageBytes = Buffer.from(match[1], 'base64');
    if (imageBytes.length > 256 * 1024 || imageBytes.toString('base64') !== match[1]) {
      console.error('Logo persistida do fornecedor excede o limite ou possui base64 inválido:', supplierId);
      return Response.json({ error: 'Não foi possível carregar a logo do fornecedor.' }, { status: 500 });
    }
    return new Response(imageBytes, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Length': String(imageBytes.length),
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Type': supplier.logoMimeType,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Não foi possível carregar logo do fornecedor:', error);
    return Response.json({ error: 'Não foi possível carregar a logo do fornecedor.' }, { status: 500 });
  }
}

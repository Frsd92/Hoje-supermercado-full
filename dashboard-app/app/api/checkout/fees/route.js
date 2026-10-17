import { prisma } from '@/lib/prisma';

export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
  try {
    const settings = await prisma.checkoutFeeSettings.findUnique({ where: { id: 'default' } });
    return Response.json({
      fees: settings
        ? {
          deliveryFee: Number(settings.deliveryFee),
          serviceFee: Number(settings.serviceFee),
          showFeeExplanations: settings.showFeeExplanations,
        }
        : { deliveryFee: 0, serviceFee: 0, showFeeExplanations: true },
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar as taxas para o checkout:', error);
    return Response.json({ error: 'Não foi possível carregar as taxas do pedido.' }, { status: 500, headers });
  }
}

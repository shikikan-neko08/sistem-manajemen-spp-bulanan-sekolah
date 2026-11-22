import { fetchMidtransStatus, verifyFirebaseBearer } from '../../../server/midtransService.ts';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

function getErrorStatus(message: string): number {
  if (message.startsWith('UNAUTHORIZED:')) return 401;
  if (message.startsWith('FORBIDDEN:')) return 403;
  if (message.startsWith('BAD_REQUEST:')) return 400;
  if (message.startsWith('MIDTRANS_NOT_CONFIGURED:')) return 503;
  return 500;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    await verifyFirebaseBearer(authHeader);

    const rawOrderId = req.query?.orderId;
    const orderId = Array.isArray(rawOrderId) ? rawOrderId[0] || '' : rawOrderId || '';
    const status = await fetchMidtransStatus(orderId);
    res.status(200).json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal memeriksa status transaksi Midtrans.';
    res.status(getErrorStatus(msg)).json({ error: msg.replace(/^[A-Z_]+:\s*/, '') });
  }
}

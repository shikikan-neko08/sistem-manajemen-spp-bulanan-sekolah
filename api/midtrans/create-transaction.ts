import {
  createMidtransTransaction,
  verifyFirebaseBearer,
  type CreateMidtransTransactionInput,
} from '../../server/midtransService.ts';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
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
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const authHeader =
      typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const caller = await verifyFirebaseBearer(authHeader);
    const body = (req.body || {}) as Partial<CreateMidtransTransactionInput>;
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

    const result = await createMidtransTransaction({
      siswaId: String(body.siswaId || ''),
      siswaNis: String(body.siswaNis || ''),
      siswaNama: String(body.siswaNama || ''),
      kelasNama: String(body.kelasNama || ''),
      customerName: String(body.customerName || caller.name || ''),
      customerEmail: caller.email || String(body.customerEmail || ''),
      customerPhone: String(body.customerPhone || ''),
      items: Array.isArray(body.items) ? body.items : [],
      finishCallbackUrl: process.env.APP_URL || originHeader,
    });

    res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal membuat transaksi Midtrans.';
    res.status(getErrorStatus(msg)).json({ error: msg.replace(/^[A-Z_]+:\s*/, '') });
  }
}

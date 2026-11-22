import { verifyMidtransWebhookNotification } from '../../server/midtransService.ts';

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

function getErrorStatus(message: string): number {
  if (message.startsWith('FORBIDDEN:')) return 403;
  if (message.startsWith('BAD_REQUEST:')) return 400;
  if (message.startsWith('MIDTRANS_NOT_CONFIGURED:')) return 503;
  return 500;
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const verified = verifyMidtransWebhookNotification(req.body);
    res.status(200).json({
      received: true,
      orderId: verified.orderId,
      transactionStatus: verified.transactionStatus,
      paymentType: verified.paymentType,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook tidak valid.';
    res.status(getErrorStatus(msg)).json({ error: msg.replace(/^[A-Z_]+:\s*/, '') });
  }
}

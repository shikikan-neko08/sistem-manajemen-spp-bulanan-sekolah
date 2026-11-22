import { getMidtransAdminDiagnostics } from '../../server/midtransService.ts';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

function getErrorStatus(message: string): number {
  if (message.startsWith('UNAUTHORIZED:')) return 401;
  if (message.startsWith('FORBIDDEN:')) return 403;
  if (message.startsWith('BAD_REQUEST:')) return 400;
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
    const diag = await getMidtransAdminDiagnostics(authHeader);
    res.status(200).json(diag);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal memeriksa diagnostik Midtrans.';
    res.status(getErrorStatus(msg)).json({ error: msg.replace(/^[A-Z_]+:\s*/, '') });
  }
}

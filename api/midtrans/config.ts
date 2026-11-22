import { getMidtransPublicConfig } from '../../server/midtransService.ts';

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const authHeader =
    typeof req.headers?.authorization === 'string' ? req.headers.authorization : undefined;
  const cfg = await getMidtransPublicConfig(authHeader);
  res.status(200).json(cfg);
}

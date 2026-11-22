import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  createMidtransTransaction,
  fetchMidtransStatus,
  getMidtransAdminDiagnostics,
  getMidtransPublicConfig,
  testMidtransApiConnection,
  verifyFirebaseBearer,
  verifyMidtransWebhookNotification,
  type CreateMidtransTransactionInput,
} from './server/midtransService.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function getErrorStatus(message: string): number {
  if (message.startsWith('UNAUTHORIZED:')) return 401;
  if (message.startsWith('FORBIDDEN:')) return 403;
  if (message.startsWith('BAD_REQUEST:')) return 400;
  if (message.startsWith('MIDTRANS_NOT_CONFIGURED:')) return 503;
  return 500;
}

function cleanErrorMessage(message: string): string {
  return message.replace(/^[A-Z_]+:\s*/, '');
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Midtrans public client configuration (never exposes MIDTRANS_SERVER_KEY)
  app.get('/api/midtrans/config', async (req, res) => {
    try {
      const cfg = await getMidtransPublicConfig(req.headers.authorization);
      res.json(cfg);
    } catch {
      res.status(500).json({ error: 'Gagal memuat konfigurasi Midtrans.' });
    }
  });

  // Admin-only: Server key diagnostics & endpoints (never returns server keys)
  app.get('/api/midtrans/admin-diagnostics', async (req, res) => {
    try {
      const diag = await getMidtransAdminDiagnostics(req.headers.authorization);
      res.json(diag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memeriksa diagnostik Midtrans.';
      res.status(getErrorStatus(msg)).json({ error: cleanErrorMessage(msg) });
    }
  });

  // Admin-only: Live connection check against active Sandbox/Production Midtrans API
  app.post('/api/midtrans/test-connection', async (req, res) => {
    try {
      const result = await testMidtransApiConnection(req.headers.authorization);
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menguji koneksi Midtrans.';
      res.status(getErrorStatus(msg)).json({ error: cleanErrorMessage(msg) });
    }
  });

  // Protected: Create Midtrans Snap transaction token
  app.post('/api/midtrans/create-transaction', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearer(req.headers.authorization);
      const body = (req.body || {}) as Partial<CreateMidtransTransactionInput>;

      const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
      const result = await createMidtransTransaction(
        {
          siswaId: String(body.siswaId || ''),
          siswaNis: String(body.siswaNis || ''),
          siswaNama: String(body.siswaNama || ''),
          kelasNama: String(body.kelasNama || ''),
          customerName: String(body.customerName || caller.name || ''),
          customerEmail: caller.email || String(body.customerEmail || ''),
          customerPhone: String(body.customerPhone || ''),
          items: Array.isArray(body.items) ? body.items : [],
          finishCallbackUrl: process.env.APP_URL || originHeader,
        },
        caller.idToken
      );

      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat transaksi Midtrans.';
      res.status(getErrorStatus(msg)).json({ error: cleanErrorMessage(msg) });
    }
  });

  // Protected: Authoritative status check from Midtrans Core API
  app.get('/api/midtrans/status/:orderId', async (req, res) => {
    try {
      const caller = await verifyFirebaseBearer(req.headers.authorization);
      const status = await fetchMidtransStatus(req.params.orderId, caller.idToken);
      res.json(status);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memeriksa status transaksi Midtrans.';
      res.status(getErrorStatus(msg)).json({ error: cleanErrorMessage(msg) });
    }
  });

  // Webhook: Midtrans Payment Notification (verifies SHA-512 signature_key)
  app.post('/api/midtrans/webhook', (req, res) => {
    try {
      const verified = verifyMidtransWebhookNotification(req.body);
      res.json({
        received: true,
        orderId: verified.orderId,
        transactionStatus: verified.transactionStatus,
        paymentType: verified.paymentType,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Webhook tidak valid.';
      res.status(getErrorStatus(msg)).json({ error: cleanErrorMessage(msg) });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output tidak ditemukan. Jalankan npm run build terlebih dahulu.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SIP-SPP SMA server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

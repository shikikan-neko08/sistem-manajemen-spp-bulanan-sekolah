import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface MidtransPublicConfig {
  configured: boolean;
  isProduction: boolean;
  clientKey: string;
  snapScriptUrl: string;
}

export interface MidtransCreateItemInput {
  tagihanId: string;
  bulan: number;
  tahun: number;
  bayarNominal: number;
}

export interface CreateMidtransTransactionInput {
  siswaId: string;
  siswaNis: string;
  siswaNama: string;
  kelasNama: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: MidtransCreateItemInput[];
  finishCallbackUrl?: string;
}

export interface MidtransTransactionResult {
  orderId: string;
  snapToken: string;
  redirectUrl: string;
  grossAmount: number;
}

export interface MidtransStatusResult {
  orderId: string;
  transactionId: string;
  transactionStatus: string;
  fraudStatus: string;
  paymentType: string;
  grossAmount: number;
  statusCode: string;
  statusMessage: string;
  settlementTime: string;
  bank: string;
  vaNumber: string;
}

export interface VerifiedFirebaseCaller {
  uid: string;
  email: string;
  name: string;
}

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const webhookStatusCache = new Map<string, MidtransStatusResult>();

function readFirebaseProjectId(): string {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    return parsed.projectId || process.env.GOOGLE_CLOUD_PROJECT || '';
  } catch {
    return process.env.GOOGLE_CLOUD_PROJECT || '';
  }
}

function getFirebaseAdminAuth() {
  const projectId = readFirebaseProjectId();
  if (!projectId || projectId === 'remixed-project-id') {
    throw new Error('Konfigurasi projectId Firebase belum tersedia di server.');
  }
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

export async function verifyFirebaseBearer(
  authHeader: string | undefined
): Promise<VerifiedFirebaseCaller> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED: Token autentikasi Firebase diperlukan.');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('UNAUTHORIZED: Token autentikasi kosong.');
  }

  const adminAuth = getFirebaseAdminAuth();
  const decoded = await adminAuth.verifyIdToken(token);
  if (!decoded.email_verified) {
    throw new Error('FORBIDDEN: Email akun belum terverifikasi.');
  }

  return {
    uid: decoded.uid,
    email: String(decoded.email || '').toLowerCase(),
    name: String(decoded.name || decoded.email || 'Pengguna'),
  };
}

function getRawMidtransCredentials() {
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
  const clientKey = (process.env.MIDTRANS_CLIENT_KEY || '').trim();
  const isProduction = (process.env.MIDTRANS_IS_PRODUCTION || 'false').trim().toLowerCase() === 'true';

  const snapBaseUrl = isProduction
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com';
  const coreApiBaseUrl = isProduction
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';

  return {
    serverKey,
    clientKey,
    isProduction,
    configured: Boolean(serverKey && clientKey),
    snapBaseUrl,
    coreApiBaseUrl,
    snapScriptUrl: `${snapBaseUrl}/snap/snap.js`,
  };
}

export function getMidtransPublicConfig(): MidtransPublicConfig {
  const cfg = getRawMidtransCredentials();
  return {
    configured: cfg.configured,
    isProduction: cfg.isProduction,
    clientKey: cfg.configured ? cfg.clientKey : '',
    snapScriptUrl: cfg.snapScriptUrl,
  };
}

function basicAuthHeader(serverKey: string): string {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

function sanitizeSafeText(val: unknown, maxLen: number): string {
  return String(val ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isSafeHttpUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function createMidtransTransaction(
  input: CreateMidtransTransactionInput
): Promise<MidtransTransactionResult> {
  const cfg = getRawMidtransCredentials();
  if (!cfg.configured) {
    throw new Error(
      'MIDTRANS_NOT_CONFIGURED: Kunci Midtrans (MIDTRANS_SERVER_KEY dan MIDTRANS_CLIENT_KEY) belum dikonfigurasi di server.'
    );
  }

  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 12) {
    throw new Error('BAD_REQUEST: Pilih antara 1 hingga 12 tagihan bulan.');
  }

  const siswaId = sanitizeSafeText(input.siswaId, 120);
  const siswaNis = sanitizeSafeText(input.siswaNis, 30);
  const siswaNama = sanitizeSafeText(input.siswaNama, 80);
  const kelasNama = sanitizeSafeText(input.kelasNama, 40);
  const customerName = sanitizeSafeText(input.customerName || siswaNama, 80) || 'Wali Murid';
  const customerEmail = sanitizeSafeText(input.customerEmail, 120);
  const customerPhone = sanitizeSafeText(input.customerPhone || '', 30);

  if (!siswaId || !siswaNama || !customerEmail.includes('@')) {
    throw new Error('BAD_REQUEST: Data siswa dan email pelanggan wajib valid.');
  }

  let grossAmount = 0;
  const itemDetails: Array<{ id: string; price: number; quantity: number; name: string }> = [];

  for (const item of input.items) {
    const bulan = Number(item.bulan);
    const tahun = Number(item.tahun);
    const price = Math.round(Number(item.bayarNominal));
    const tagihanId = sanitizeSafeText(item.tagihanId, 50);

    if (
      !tagihanId ||
      !Number.isInteger(bulan) ||
      bulan < 1 ||
      bulan > 12 ||
      !Number.isInteger(tahun) ||
      tahun < 2020 ||
      tahun > 2100 ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 50000000
    ) {
      throw new Error('BAD_REQUEST: Detail nominal atau periode tagihan tidak valid.');
    }

    grossAmount += price;
    const bulanLabel = NAMA_BULAN[bulan - 1] || `Bln ${bulan}`;
    const itemName = `SPP ${bulanLabel} ${tahun} - ${siswaNama}`.slice(0, 50);
    itemDetails.push({
      id: tagihanId,
      price,
      quantity: 1,
      name: itemName,
    });
  }

  if (grossAmount <= 0 || grossAmount > 100000000) {
    throw new Error('BAD_REQUEST: Total nominal transaksi di luar batas wajar.');
  }

  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  const orderId = `SPP-${Date.now().toString(36).toUpperCase()}-${rand}`.slice(0, 50);

  const safeCallback = isSafeHttpUrl(input.finishCallbackUrl || process.env.APP_URL);
  const payload: Record<string, unknown> = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount,
    },
    item_details: itemDetails,
    customer_details: {
      first_name: customerName,
      email: customerEmail,
      ...(customerPhone ? { phone: customerPhone } : {}),
    },
    custom_field1: siswaNis,
    custom_field2: kelasNama,
    custom_field3: siswaId,
  };

  if (safeCallback) {
    payload.callbacks = {
      finish: safeCallback,
    };
  }

  const response = await fetch(`${cfg.snapBaseUrl}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(cfg.serverKey),
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json().catch(() => ({}))) as {
    token?: string;
    redirect_url?: string;
    error_messages?: string[];
  };

  if (!response.ok || !json.token) {
    const detail = Array.isArray(json.error_messages)
      ? json.error_messages.join(', ')
      : `HTTP ${response.status}`;
    throw new Error(`MIDTRANS_API_ERROR: Gagal membuat transaksi Midtrans (${detail}).`);
  }

  return {
    orderId,
    snapToken: json.token,
    redirectUrl: json.redirect_url || '',
    grossAmount,
  };
}

function normalizeMidtransStatusResponse(
  orderId: string,
  raw: Record<string, unknown>
): MidtransStatusResult {
  const vaNumbers = Array.isArray(raw.va_numbers)
    ? (raw.va_numbers as Array<{ bank?: string; va_number?: string }>)
    : [];
  const firstVa = vaNumbers[0];
  const permataVa = typeof raw.permata_va_number === 'string' ? raw.permata_va_number : '';
  const billKey = typeof raw.bill_key === 'string' ? raw.bill_key : '';

  return {
    orderId,
    transactionId: String(raw.transaction_id || ''),
    transactionStatus: String(raw.transaction_status || 'pending'),
    fraudStatus: String(raw.fraud_status || ''),
    paymentType: String(raw.payment_type || ''),
    grossAmount: Math.round(Number(raw.gross_amount || 0)) || 0,
    statusCode: String(raw.status_code || ''),
    statusMessage: String(raw.status_message || ''),
    settlementTime: String(raw.settlement_time || ''),
    bank: firstVa?.bank || (permataVa ? 'permata' : billKey ? 'mandiri' : ''),
    vaNumber: firstVa?.va_number || permataVa || billKey || '',
  };
}

export async function fetchMidtransStatus(orderId: string): Promise<MidtransStatusResult> {
  const cleanOrderId = sanitizeSafeText(orderId, 60);
  if (!/^[a-zA-Z0-9_\-]{5,60}$/.test(cleanOrderId)) {
    throw new Error('BAD_REQUEST: Format orderId Midtrans tidak valid.');
  }

  const cfg = getRawMidtransCredentials();
  if (!cfg.configured) {
    throw new Error(
      'MIDTRANS_NOT_CONFIGURED: Kunci Midtrans belum dikonfigurasi di server.'
    );
  }

  const response = await fetch(
    `${cfg.coreApiBaseUrl}/v2/${encodeURIComponent(cleanOrderId)}/status`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthHeader(cfg.serverKey),
      },
    }
  );

  if (response.status === 404) {
    const cached = webhookStatusCache.get(cleanOrderId);
    if (cached) return cached;
    return {
      orderId: cleanOrderId,
      transactionId: '',
      transactionStatus: 'pending',
      fraudStatus: '',
      paymentType: '',
      grossAmount: 0,
      statusCode: '404',
      statusMessage: 'Menunggu pelanggan menyelesaikan pemilihan metode pembayaran di Midtrans Snap.',
      settlementTime: '',
      bank: '',
      vaNumber: '',
    };
  }

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok && String(json.status_code || '') !== '404') {
    throw new Error(
      `MIDTRANS_API_ERROR: Gagal memeriksa status transaksi (${String(
        json.status_message || response.status
      )}).`
    );
  }

  const normalized = normalizeMidtransStatusResponse(cleanOrderId, json);
  if (normalized.transactionStatus && normalized.transactionStatus !== '404') {
    cacheWebhookStatus(normalized);
  }
  return normalized;
}

function cacheWebhookStatus(entry: MidtransStatusResult) {
  if (webhookStatusCache.size >= 500) {
    const firstKey = webhookStatusCache.keys().next().value;
    if (firstKey) webhookStatusCache.delete(firstKey);
  }
  webhookStatusCache.set(entry.orderId, entry);
}

export function verifyMidtransWebhookNotification(body: unknown): MidtransStatusResult {
  const cfg = getRawMidtransCredentials();
  if (!cfg.serverKey) {
    throw new Error('MIDTRANS_NOT_CONFIGURED: MIDTRANS_SERVER_KEY belum diatur.');
  }

  if (!body || typeof body !== 'object') {
    throw new Error('BAD_REQUEST: Payload webhook tidak valid.');
  }

  const raw = body as Record<string, unknown>;
  const orderId = typeof raw.order_id === 'string' ? raw.order_id.trim() : '';
  const statusCode = typeof raw.status_code === 'string' ? raw.status_code.trim() : '';
  const grossAmount = typeof raw.gross_amount === 'string' ? raw.gross_amount.trim() : '';
  const signatureKey = typeof raw.signature_key === 'string' ? raw.signature_key.trim().toLowerCase() : '';

  if (!orderId || !statusCode || !grossAmount || !signatureKey) {
    throw new Error('BAD_REQUEST: Field signature webhook Midtrans tidak lengkap.');
  }

  const expectedHex = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${cfg.serverKey}`)
    .digest('hex')
    .toLowerCase();

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const actualBuf = Buffer.from(signatureKey, 'utf8');

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error('FORBIDDEN: Signature webhook Midtrans tidak valid.');
  }

  const normalized = normalizeMidtransStatusResponse(orderId, raw);
  cacheWebhookStatus(normalized);
  return normalized;
}

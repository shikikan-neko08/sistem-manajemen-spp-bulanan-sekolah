import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export interface MidtransPublicConfig {
  configured: boolean;
  isProduction: boolean;
  midtransAktif: boolean;
  transferManualAktif: boolean;
  clientKey: string;
  snapScriptUrl: string;
  keyModeMismatch: boolean;
}

export interface MidtransAdminDiagnostics {
  activeConfigured: boolean;
  sandboxConfigured: boolean;
  productionConfigured: boolean;
  isProduction: boolean;
  envFallbackIsProduction: boolean;
  keyModeMismatch: boolean;
  clientKeyMasked: string;
  sandboxClientKeyMasked: string;
  productionClientKeyMasked: string;
  snapBaseUrl: string;
  coreApiBaseUrl: string;
  snapScriptUrl: string;
}

export interface MidtransConnectionTestResult {
  ok: boolean;
  isProduction: boolean;
  statusCode: number;
  message: string;
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
  idToken: string;
}

interface ServerSystemSettings {
  midtransProductionMode?: boolean;
  midtransAktif?: boolean;
  transferManualAktif?: boolean;
  midtransEnabledPayments?: string[];
  midtransOrderPrefix?: string;
  midtransExpiryMenit?: number;
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'ardaffa2000@gmail.com';

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

function readFirebaseAppletConfig(): { projectId: string; databaseId: string } {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string; firestoreDatabaseId?: string };
    return {
      projectId: parsed.projectId || process.env.GOOGLE_CLOUD_PROJECT || '',
      databaseId: parsed.firestoreDatabaseId || '(default)',
    };
  } catch {
    return {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      databaseId: '(default)',
    };
  }
}

function getFirebaseAdminAuth() {
  const { projectId } = readFirebaseAppletConfig();
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
    idToken: token,
  };
}

interface FirestoreRestValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  arrayValue?: { values?: FirestoreRestValue[] };
}

async function fetchFirestoreDocWithCallerToken(
  docPath: string,
  idToken: string
): Promise<Record<string, FirestoreRestValue> | null> {
  const { projectId, databaseId } = readFirebaseAppletConfig();
  if (!projectId || !idToken) return null;

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents/${docPath}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { fields?: Record<string, FirestoreRestValue> };
    return json.fields || null;
  } catch {
    return null;
  }
}

export async function verifyAdminCaller(
  authHeader: string | undefined
): Promise<VerifiedFirebaseCaller> {
  const caller = await verifyFirebaseBearer(authHeader);
  if (caller.email === BOOTSTRAPPED_ADMIN_EMAIL) {
    return caller;
  }
  const userFields = await fetchFirestoreDocWithCallerToken(`users/${caller.uid}`, caller.idToken);
  const role = userFields?.peran?.stringValue || '';
  const active = userFields?.aktif?.booleanValue === true;
  if (role !== 'admin' || !active) {
    throw new Error('FORBIDDEN: Hanya Admin aktif yang dapat mengakses konfigurasi ini.');
  }
  return caller;
}

async function fetchServerSystemSettings(idToken?: string): Promise<ServerSystemSettings> {
  if (!idToken) return {};
  const fields = await fetchFirestoreDocWithCallerToken('pengaturan_sistem/default', idToken);
  if (!fields) return {};

  const enabledPaymentsRaw = fields.midtransEnabledPayments?.arrayValue?.values || [];
  const enabledPayments = enabledPaymentsRaw
    .map((v) => v.stringValue || '')
    .filter((v) => /^[a-z0-9_]{2,40}$/.test(v));

  const expiryRaw =
    fields.midtransExpiryMenit?.integerValue !== undefined
      ? Number(fields.midtransExpiryMenit.integerValue)
      : fields.midtransExpiryMenit?.doubleValue;

  return {
    midtransProductionMode:
      typeof fields.midtransProductionMode?.booleanValue === 'boolean'
        ? fields.midtransProductionMode.booleanValue
        : undefined,
    midtransAktif:
      typeof fields.midtransAktif?.booleanValue === 'boolean'
        ? fields.midtransAktif.booleanValue
        : undefined,
    transferManualAktif:
      typeof fields.transferManualAktif?.booleanValue === 'boolean'
        ? fields.transferManualAktif.booleanValue
        : undefined,
    midtransEnabledPayments: enabledPayments,
    midtransOrderPrefix: fields.midtransOrderPrefix?.stringValue || undefined,
    midtransExpiryMenit: Number.isFinite(expiryRaw) ? Number(expiryRaw) : undefined,
  };
}

function maskKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 10) return '••••••';
  return `${trimmed.slice(0, 10)}••••${trimmed.slice(-4)}`;
}

function getEnvBoolIsProduction(): boolean {
  return (process.env.MIDTRANS_IS_PRODUCTION || 'false').trim().toLowerCase() === 'true';
}

function getRawMidtransCredentials(isProductionOverride?: boolean) {
  const isProduction =
    typeof isProductionOverride === 'boolean' ? isProductionOverride : getEnvBoolIsProduction();

  const defaultServerKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
  const defaultClientKey = (process.env.MIDTRANS_CLIENT_KEY || '').trim();
  const sandboxServerKey = (process.env.MIDTRANS_SANDBOX_SERVER_KEY || '').trim();
  const sandboxClientKey = (process.env.MIDTRANS_SANDBOX_CLIENT_KEY || '').trim();
  const prodServerKey = (process.env.MIDTRANS_PRODUCTION_SERVER_KEY || '').trim();
  const prodClientKey = (process.env.MIDTRANS_PRODUCTION_CLIENT_KEY || '').trim();

  const serverKey = isProduction
    ? prodServerKey || defaultServerKey
    : sandboxServerKey || defaultServerKey;
  const clientKey = isProduction
    ? prodClientKey || defaultClientKey
    : sandboxClientKey || defaultClientKey;

  const snapBaseUrl = isProduction
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com';
  const coreApiBaseUrl = isProduction
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';

  const hasSandboxPrefix =
    serverKey.startsWith('SB-Mid-') || clientKey.startsWith('SB-Mid-');
  const hasProdPrefix =
    serverKey.startsWith('Mid-server-') || clientKey.startsWith('Mid-client-');
  const keyModeMismatch =
    Boolean(serverKey && clientKey) &&
    ((isProduction && hasSandboxPrefix) || (!isProduction && hasProdPrefix));

  return {
    serverKey,
    clientKey,
    isProduction,
    configured: Boolean(serverKey && clientKey),
    sandboxConfigured: Boolean(
      (sandboxServerKey && sandboxClientKey) ||
        (defaultServerKey && defaultClientKey && !defaultServerKey.startsWith('Mid-server-'))
    ),
    productionConfigured: Boolean(
      (prodServerKey && prodClientKey) ||
        (defaultServerKey && defaultClientKey && defaultServerKey.startsWith('Mid-server-'))
    ),
    sandboxClientKeyMasked: maskKey(sandboxClientKey || (!defaultClientKey.startsWith('Mid-client-') ? defaultClientKey : '')),
    productionClientKeyMasked: maskKey(prodClientKey || (defaultClientKey.startsWith('Mid-client-') ? defaultClientKey : '')),
    keyModeMismatch,
    snapBaseUrl,
    coreApiBaseUrl,
    snapScriptUrl: `${snapBaseUrl}/snap/snap.js`,
  };
}

async function resolveOptionalBearerIdToken(authHeader?: string): Promise<string | undefined> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  try {
    const caller = await verifyFirebaseBearer(authHeader);
    return caller.idToken;
  } catch {
    return undefined;
  }
}

export async function getMidtransPublicConfig(
  authHeader?: string
): Promise<MidtransPublicConfig> {
  const idToken = await resolveOptionalBearerIdToken(authHeader);
  const sysSettings = await fetchServerSystemSettings(idToken);
  const cfg = getRawMidtransCredentials(sysSettings.midtransProductionMode);
  return {
    configured: cfg.configured,
    isProduction: cfg.isProduction,
    midtransAktif: sysSettings.midtransAktif ?? true,
    transferManualAktif: sysSettings.transferManualAktif ?? true,
    clientKey: cfg.configured ? cfg.clientKey : '',
    snapScriptUrl: cfg.snapScriptUrl,
    keyModeMismatch: cfg.keyModeMismatch,
  };
}

export async function getMidtransAdminDiagnostics(
  authHeader: string | undefined
): Promise<MidtransAdminDiagnostics> {
  const caller = await verifyAdminCaller(authHeader);
  const sysSettings = await fetchServerSystemSettings(caller.idToken);
  const cfg = getRawMidtransCredentials(sysSettings.midtransProductionMode);

  return {
    activeConfigured: cfg.configured,
    sandboxConfigured: cfg.sandboxConfigured,
    productionConfigured: cfg.productionConfigured,
    isProduction: cfg.isProduction,
    envFallbackIsProduction: getEnvBoolIsProduction(),
    keyModeMismatch: cfg.keyModeMismatch,
    clientKeyMasked: maskKey(cfg.clientKey),
    sandboxClientKeyMasked: cfg.sandboxClientKeyMasked,
    productionClientKeyMasked: cfg.productionClientKeyMasked,
    snapBaseUrl: cfg.snapBaseUrl,
    coreApiBaseUrl: cfg.coreApiBaseUrl,
    snapScriptUrl: cfg.snapScriptUrl,
  };
}

export async function testMidtransApiConnection(
  authHeader: string | undefined
): Promise<MidtransConnectionTestResult> {
  const caller = await verifyAdminCaller(authHeader);
  const sysSettings = await fetchServerSystemSettings(caller.idToken);
  const cfg = getRawMidtransCredentials(sysSettings.midtransProductionMode);
  const modeLabel = cfg.isProduction ? 'Production' : 'Sandbox';

  if (!cfg.configured) {
    return {
      ok: false,
      isProduction: cfg.isProduction,
      statusCode: 503,
      message: `Kredensial Midtrans untuk mode ${modeLabel} belum lengkap di Environment Variables server.`,
    };
  }

  if (cfg.keyModeMismatch) {
    return {
      ok: false,
      isProduction: cfg.isProduction,
      statusCode: 400,
      message: `Ketidakcocokan kunci: Mode aktif adalah ${modeLabel}, tetapi kunci yang terpasang berasal dari lingkungan ${
        cfg.isProduction ? 'Sandbox (SB-Mid-...)' : 'Production (Mid-...)'
      }.`,
    };
  }

  try {
    const response = await fetch(`${cfg.coreApiBaseUrl}/v2/SIP-SPP-PING-CHECK/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthHeader(cfg.serverKey),
      },
    });

    if (response.status === 404 || response.ok) {
      return {
        ok: true,
        isProduction: cfg.isProduction,
        statusCode: response.status,
        message: `Koneksi API Midtrans (${modeLabel}) berhasil diverifikasi. Server Key valid.`,
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        isProduction: cfg.isProduction,
        statusCode: 401,
        message: `Midtrans menolak autentikasi (HTTP 401) pada mode ${modeLabel}. Periksa kembali Server Key Anda.`,
      };
    }

    return {
      ok: false,
      isProduction: cfg.isProduction,
      statusCode: response.status,
      message: `Midtrans merespons dengan status HTTP ${response.status}.`,
    };
  } catch (err) {
    return {
      ok: false,
      isProduction: cfg.isProduction,
      statusCode: 502,
      message: err instanceof Error ? err.message : 'Gagal menghubungi server Midtrans.',
    };
  }
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
  input: CreateMidtransTransactionInput,
  callerIdToken?: string
): Promise<MidtransTransactionResult> {
  const sysSettings = await fetchServerSystemSettings(callerIdToken);
  if (sysSettings.midtransAktif === false) {
    throw new Error('BAD_REQUEST: Pembayaran online Midtrans sedang dinonaktifkan oleh Admin.');
  }

  const cfg = getRawMidtransCredentials(sysSettings.midtransProductionMode);
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

  const rawPrefix = (sysSettings.midtransOrderPrefix || 'SPP')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  const orderPrefix = rawPrefix.length >= 2 ? rawPrefix : 'SPP';
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  const orderId = `${orderPrefix}-${Date.now().toString(36).toUpperCase()}-${rand}`.slice(0, 50);

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

  if (
    Array.isArray(sysSettings.midtransEnabledPayments) &&
    sysSettings.midtransEnabledPayments.length > 0
  ) {
    payload.enabled_payments = sysSettings.midtransEnabledPayments;
  }

  if (
    typeof sysSettings.midtransExpiryMenit === 'number' &&
    sysSettings.midtransExpiryMenit >= 15 &&
    sysSettings.midtransExpiryMenit <= 10080
  ) {
    payload.expiry = {
      unit: 'minutes',
      duration: Math.round(sysSettings.midtransExpiryMenit),
    };
  }

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

export async function fetchMidtransStatus(
  orderId: string,
  callerIdToken?: string
): Promise<MidtransStatusResult> {
  const cleanOrderId = sanitizeSafeText(orderId, 60);
  if (!/^[a-zA-Z0-9_\-]{5,60}$/.test(cleanOrderId)) {
    throw new Error('BAD_REQUEST: Format orderId Midtrans tidak valid.');
  }

  const sysSettings = await fetchServerSystemSettings(callerIdToken);
  const cfg = getRawMidtransCredentials(sysSettings.midtransProductionMode);
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
  const candidateKeys = Array.from(
    new Set(
      [
        (process.env.MIDTRANS_SERVER_KEY || '').trim(),
        (process.env.MIDTRANS_SANDBOX_SERVER_KEY || '').trim(),
        (process.env.MIDTRANS_PRODUCTION_SERVER_KEY || '').trim(),
      ].filter(Boolean)
    )
  );

  if (candidateKeys.length === 0) {
    throw new Error('MIDTRANS_NOT_CONFIGURED: MIDTRANS_SERVER_KEY belum diatur.');
  }

  if (!body || typeof body !== 'object') {
    throw new Error('BAD_REQUEST: Payload webhook tidak valid.');
  }

  const raw = body as Record<string, unknown>;
  const orderId = typeof raw.order_id === 'string' ? raw.order_id.trim() : '';
  const statusCode = typeof raw.status_code === 'string' ? raw.status_code.trim() : '';
  const grossAmount = typeof raw.gross_amount === 'string' ? raw.gross_amount.trim() : '';
  const signatureKey =
    typeof raw.signature_key === 'string' ? raw.signature_key.trim().toLowerCase() : '';

  if (!orderId || !statusCode || !grossAmount || !signatureKey) {
    throw new Error('BAD_REQUEST: Field signature webhook Midtrans tidak lengkap.');
  }

  const actualBuf = Buffer.from(signatureKey, 'utf8');
  const validMatch = candidateKeys.some((serverKey) => {
    const expectedHex = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
      .digest('hex')
      .toLowerCase();
    const expectedBuf = Buffer.from(expectedHex, 'utf8');
    return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
  });

  if (!validMatch) {
    throw new Error('FORBIDDEN: Signature webhook Midtrans tidak valid.');
  }

  const normalized = normalizeMidtransStatusResponse(orderId, raw);
  cacheWebhookStatus(normalized);
  return normalized;
}

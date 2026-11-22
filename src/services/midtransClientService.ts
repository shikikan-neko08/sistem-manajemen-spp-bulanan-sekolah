import { auth } from '../lib/firebase.ts';

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

export interface MidtransCreateOrderResponse {
  orderId: string;
  snapToken: string;
  redirectUrl: string;
  grossAmount: number;
}

export interface MidtransStatusResponse {
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

export interface MidtransSnapPayResult {
  order_id?: string;
  transaction_status?: string;
  payment_type?: string;
  status_message?: string;
}

interface SnapWindow {
  snap?: {
    pay: (
      snapToken: string,
      callbacks?: {
        onSuccess?: (result: MidtransSnapPayResult) => void;
        onPending?: (result: MidtransSnapPayResult) => void;
        onError?: (result: MidtransSnapPayResult) => void;
        onClose?: () => void;
      }
    ) => void;
  };
}

let loadedSnapUrl = '';

async function getBearerToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sesi login tidak ditemukan. Silakan masuk ulang.');
  }
  return user.getIdToken();
}

export async function getMidtransConfig(): Promise<MidtransPublicConfig> {
  const headers: Record<string, string> = {};
  if (auth.currentUser) {
    try {
      headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    } catch {
      // Fallback to unauthenticated config check
    }
  }
  const res = await fetch('/api/midtrans/config', { headers });
  if (!res.ok) {
    throw new Error('Gagal memeriksa konfigurasi Midtrans di server.');
  }
  return (await res.json()) as MidtransPublicConfig;
}

export async function getMidtransAdminDiagnostics(): Promise<MidtransAdminDiagnostics> {
  const idToken = await getBearerToken();
  const res = await fetch('/api/midtrans/admin-diagnostics', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const data = (await res.json().catch(() => ({}))) as MidtransAdminDiagnostics & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Gagal memuat diagnostik Midtrans server.');
  }
  return data;
}

export async function testMidtransConnection(): Promise<MidtransConnectionTestResult> {
  const idToken = await getBearerToken();
  const res = await fetch('/api/midtrans/test-connection', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const data = (await res.json().catch(() => ({}))) as MidtransConnectionTestResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Gagal menguji koneksi API Midtrans.');
  }
  return data;
}

export async function createMidtransOrder(params: {
  siswaId: string;
  siswaNis: string;
  siswaNama: string;
  kelasNama: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  items: Array<{ tagihanId: string; bulan: number; tahun: number; bayarNominal: number }>;
}): Promise<MidtransCreateOrderResponse> {
  const idToken = await getBearerToken();
  const res = await fetch('/api/midtrans/create-transaction', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  const data = (await res.json().catch(() => ({}))) as MidtransCreateOrderResponse & {
    error?: string;
  };
  if (!res.ok || !data.snapToken) {
    throw new Error(data.error || 'Gagal membuat transaksi pembayaran Midtrans.');
  }
  return data;
}

export async function checkMidtransOrderStatus(orderId: string): Promise<MidtransStatusResponse> {
  const idToken = await getBearerToken();
  const res = await fetch(`/api/midtrans/status/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = (await res.json().catch(() => ({}))) as MidtransStatusResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'Gagal memeriksa status transaksi Midtrans.');
  }
  return data;
}

export function isMidtransSettled(status?: string, fraudStatus?: string): boolean {
  const s = (status || '').toLowerCase();
  const f = (fraudStatus || '').toLowerCase();
  if (s === 'settlement') return true;
  if (s === 'capture' && (!f || f === 'accept')) return true;
  return false;
}

export async function loadMidtransSnapScript(
  snapScriptUrl: string,
  clientKey: string
): Promise<NonNullable<SnapWindow['snap']>> {
  const w = window as unknown as SnapWindow;
  if (w.snap && loadedSnapUrl === snapScriptUrl) {
    return w.snap;
  }

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-midtrans-snap="true"]');
    if (existing) {
      if (existing.getAttribute('src') === snapScriptUrl && w.snap) {
        loadedSnapUrl = snapScriptUrl;
        resolve();
        return;
      }
      existing.remove();
    }

    const script = document.createElement('script');
    script.src = snapScriptUrl;
    script.setAttribute('data-client-key', clientKey);
    script.setAttribute('data-midtrans-snap', 'true');
    script.async = true;
    script.onload = () => {
      loadedSnapUrl = snapScriptUrl;
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Gagal memuat skrip Midtrans Snap. Periksa koneksi internet Anda.'));
    };
    document.head.appendChild(script);
  });

  if (!w.snap) {
    throw new Error('Midtrans Snap gagal diinisialisasi.');
  }
  return w.snap;
}

export const NAMA_BULAN = [
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

export function namaBulan(bulan: number): string {
  return NAMA_BULAN[bulan - 1] || `Bulan ${bulan}`;
}

export function formatRupiah(nominal: number): string {
  const safe = Number.isFinite(nominal) ? Math.round(nominal) : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

export function formatTanggalIndonesia(dateStr: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

export function formatTanggalSingkat(dateStr: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatTimestamp(ts: unknown): string {
  if (!ts) return '-';
  try {
    const maybeTs = ts as { toDate?: () => Date; seconds?: number };
    const d =
      typeof maybeTs.toDate === 'function'
        ? maybeTs.toDate()
        : typeof maybeTs.seconds === 'number'
        ? new Date(maybeTs.seconds * 1000)
        : new Date(String(ts));
    if (Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '-';
  }
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emailToKey(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function sanitizeId(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

export function hitungDiskon(
  nominalTarif: number,
  diskonTipe: 'none' | 'nominal' | 'persen',
  diskonNilai: number
): { nominalDiskon: number; nominalTagihan: number } {
  const tarif = Math.max(0, Math.round(nominalTarif));
  let diskon = 0;
  if (diskonTipe === 'nominal') {
    diskon = Math.max(0, Math.round(diskonNilai));
  } else if (diskonTipe === 'persen') {
    const persen = Math.min(100, Math.max(0, diskonNilai));
    diskon = Math.round((tarif * persen) / 100);
  }
  const capped = Math.min(tarif, diskon);
  return {
    nominalDiskon: capped,
    nominalTagihan: Math.max(0, tarif - capped),
  };
}

export function labelPeran(peran: string): string {
  switch (peran) {
    case 'admin':
      return 'Admin';
    case 'petugas':
      return 'Petugas / Bendahara';
    case 'kepala_sekolah':
      return 'Kepala Sekolah';
    case 'orang_tua':
      return 'Orang Tua / Wali';
    case 'pending':
      return 'Menunggu Persetujuan';
    default:
      return peran;
  }
}

export function labelKanalOrtu(kanal: string): string {
  switch (kanal) {
    case 'midtrans':
      return 'Midtrans Snap';
    case 'transfer_bank':
      return 'Transfer Bank';
    case 'qris':
      return 'QRIS Sekolah';
    case 'virtual_account':
      return 'Virtual Account';
    default:
      return kanal;
  }
}

export function labelMidtransStatus(status?: string): string {
  switch ((status || '').toLowerCase()) {
    case 'settlement':
    case 'capture':
      return 'Lunas di Midtrans';
    case 'pending':
      return 'Menunggu Pembayaran';
    case 'expire':
      return 'Kedaluwarsa';
    case 'cancel':
      return 'Dibatalkan';
    case 'deny':
      return 'Ditolak Gateway';
    default:
      return status || 'Menunggu Pembayaran';
  }
}

export function virtualAccountSiswa(nis: string, prefix = '88102'): string {
  const cleanPrefix = (prefix || '88102').replace(/[^0-9]/g, '') || '88102';
  const digits = nis.replace(/[^0-9]/g, '');
  return `${cleanPrefix}${digits.padStart(10, '0').slice(-10)}`;
}

export const MIDTRANS_PAYMENT_CHANNELS: Array<{ id: string; label: string; group: string }> = [
  { id: 'qris', label: 'QRIS (Semua E-Wallet & Mobile Banking)', group: 'Instan / QR' },
  { id: 'gopay', label: 'GoPay', group: 'E-Wallet' },
  { id: 'shopeepay', label: 'ShopeePay', group: 'E-Wallet' },
  { id: 'bca_va', label: 'BCA Virtual Account', group: 'Virtual Account' },
  { id: 'bni_va', label: 'BNI Virtual Account', group: 'Virtual Account' },
  { id: 'bri_va', label: 'BRI Virtual Account', group: 'Virtual Account' },
  { id: 'permata_va', label: 'Permata Virtual Account', group: 'Virtual Account' },
  { id: 'echannel', label: 'Mandiri Bill Payment', group: 'Virtual Account' },
  { id: 'other_va', label: 'VA Bank Lainnya', group: 'Virtual Account' },
  { id: 'credit_card', label: 'Kartu Kredit / Debit', group: 'Kartu' },
  { id: 'alfamart', label: 'Alfamart', group: 'Gerai Retail' },
  { id: 'indomaret', label: 'Indomaret', group: 'Gerai Retail' },
];

export const DEFAULT_PENGATURAN_SISTEM = {
  id: 'default',
  midtransProductionMode: false,
  midtransAktif: true,
  transferManualAktif: true,
  midtransEnabledPayments: [
    'qris',
    'gopay',
    'shopeepay',
    'bca_va',
    'bni_va',
    'bri_va',
    'permata_va',
    'echannel',
  ],
  midtransOrderPrefix: 'SPP',
  midtransExpiryMenit: 1440,
  portalOrtuAktif: true,
  pesanPemeliharaanPortal:
    'Portal pembayaran sedang dalam pemeliharaan terjadwal. Silakan hubungi Tata Usaha sekolah untuk informasi lebih lanjut.',
  petugasBolehBatalkanPembayaran: true,
  petugasBolehGenerateTagihan: true,
  petugasBolehLihatMaster: true,
  kepsekBolehLihatAudit: true,
  ortuBolehCicilan: true,
  autoGenerateTagihan: true,
  tanggalJatuhTempo: 10,
  prefixKwitansi: 'KWT',
  prefixPengajuanOrtu: 'ONL',
  catatanKakiKwitansi: 'Simpan kwitansi ini sebagai bukti pembayaran SPP yang sah.',
  tampilkanNipKepsekDiKwitansi: false,
  templateWaTunggakan:
    'Yth. Bapak/Ibu Wali Murid dari {nama_siswa} (NIS: {nis}, Kelas {kelas}). Menginformasikan tagihan SPP yang belum terbayar sebesar {total_tunggakan}. Mohon segera melakukan pembayaran melalui Portal Orang Tua atau loket Tata Usaha {nama_sekolah}. Terima kasih.',
};


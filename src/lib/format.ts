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
    case 'pending':
      return 'Menunggu Persetujuan';
    default:
      return peran;
  }
}

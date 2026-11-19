import type { StatusPembayaran, StatusSiswa, StatusTagihan } from '../types/spp.ts';

export function StatusTagihanBadge({ status }: { status: StatusTagihan }) {
  const styles: Record<StatusTagihan, { label: string; cls: string }> = {
    lunas: {
      label: 'Lunas',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    sebagian: {
      label: 'Sebagian',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    belum_bayar: {
      label: 'Belum Bayar',
      cls: 'bg-red-50 text-red-700 border-red-200',
    },
  };
  const cfg = styles[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export function StatusPembayaranBadge({ status }: { status: StatusPembayaran }) {
  if (status === 'dibatalkan') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border bg-red-50 text-red-700 border-red-200 whitespace-nowrap">
        Dibatalkan
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">
      Sah
    </span>
  );
}

export function StatusSiswaBadge({ status }: { status: StatusSiswa }) {
  const map: Record<StatusSiswa, { label: string; cls: string }> = {
    aktif: { label: 'Aktif', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    lulus: { label: 'Lulus', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
    pindah: { label: 'Pindah', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    nonaktif: { label: 'Nonaktif', cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const cfg = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

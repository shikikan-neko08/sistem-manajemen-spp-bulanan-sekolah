import { useMemo, useState } from 'react';
import { CreditCard, Download, FileSpreadsheet, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { formatRupiah, NAMA_BULAN, namaBulan } from '../lib/format.ts';
import { eksporLaporanExcel, eksporLaporanPdf } from '../services/exportService.ts';
import type { Siswa } from '../types/spp.ts';

interface Props {
  onBayarSiswa: (siswaId: string) => void;
}

export function TunggakanPage({ onBayarSiswa }: Props) {
  const { canTransact } = useAuth();
  const { sekolah, kelasList, siswaList, tagihanList } = useSppData();

  const now = new Date();
  const [filterKelas, setFilterKelas] = useState('all');
  const [filterBulan, setFilterBulan] = useState<string>('all');
  const [filterTahun, setFilterTahun] = useState<string>(String(now.getFullYear()));
  const [searchQuery, setSearchQuery] = useState('');

  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);
  const siswaMap = useMemo(() => new Map(siswaList.map((s) => [s.id, s])), [siswaList]);

  const tunggakanRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const grouped = new Map<
      string,
      {
        siswa: Siswa;
        kelasNama: string;
        bulanMenunggak: string[];
        jumlahBulan: number;
        totalTunggakan: number;
      }
    >();

    for (const t of tagihanList) {
      if (t.status === 'lunas' || t.sisaTagihan <= 0) continue;
      if (filterKelas !== 'all' && t.kelasId !== filterKelas) continue;
      if (filterBulan !== 'all' && t.bulan !== Number(filterBulan)) continue;
      if (filterTahun !== 'all' && t.tahun !== Number(filterTahun)) continue;

      const siswa = siswaMap.get(t.siswaId);
      if (!siswa) continue;
      if (
        q &&
        !siswa.nama.toLowerCase().includes(q) &&
        !siswa.nis.toLowerCase().includes(q)
      ) {
        continue;
      }

      const existing = grouped.get(siswa.id) || {
        siswa,
        kelasNama: kelasMap.get(siswa.kelasId) || '-',
        bulanMenunggak: [],
        jumlahBulan: 0,
        totalTunggakan: 0,
      };
      existing.bulanMenunggak.push(`${namaBulan(t.bulan)} ${t.tahun}`);
      existing.jumlahBulan += 1;
      existing.totalTunggakan += t.sisaTagihan;
      grouped.set(siswa.id, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => b.totalTunggakan - a.totalTunggakan);
  }, [tagihanList, filterKelas, filterBulan, filterTahun, searchQuery, siswaMap, kelasMap]);

  const grandTotal = useMemo(
    () => tunggakanRows.reduce((acc, r) => acc + r.totalTunggakan, 0),
    [tunggakanRows]
  );

  const handleExportExcel = () => {
    const rows = tunggakanRows.map((r, i) => ({
      No: i + 1,
      NIS: r.siswa.nis,
      Nama: r.siswa.nama,
      Kelas: r.kelasNama,
      'No HP Ortu': r.siswa.noHpOrtu || '-',
      'Bulan Menunggak': r.bulanMenunggak.join(', '),
      'Jumlah Bulan': r.jumlahBulan,
      'Total Tunggakan (Rp)': r.totalTunggakan,
    }));
    eksporLaporanExcel(rows, 'Tunggakan SPP', `daftar-tunggakan-${filterTahun}.xlsx`);
  };

  const handleExportPdf = () => {
    const sub = `Kelas: ${
      filterKelas === 'all' ? 'Semua Kelas' : kelasMap.get(filterKelas) || '-'
    } · Bulan: ${filterBulan === 'all' ? 'Semua Bulan' : namaBulan(Number(filterBulan))} ${
      filterTahun === 'all' ? '' : filterTahun
    }`;
    eksporLaporanPdf({
      judul: 'LAPORAN DAFTAR TUNGGAKAN SPP SISWA',
      subjudul: sub,
      columns: ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Rincian Bulan', 'Total Tunggakan'],
      rows: tunggakanRows.map((r, i) => [
        i + 1,
        r.siswa.nis,
        r.siswa.nama,
        r.kelasNama,
        r.bulanMenunggak.join(', '),
        formatRupiah(r.totalTunggakan),
      ]),
      ringkasan: [
        `Jumlah Siswa Menunggak: ${tunggakanRows.length} siswa`,
        `Total Tunggakan Keseluruhan: ${formatRupiah(grandTotal)}`,
      ],
      filename: `laporan-tunggakan-${filterTahun}.pdf`,
      sekolah,
    });
  };

  return (
    <div className="space-y-5">
      {/* Filter & Total */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari NIS atau nama siswa..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">Semua Kelas</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
          <select
            value={filterBulan}
            onChange={(e) => setFilterBulan(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">Semua Bulan</option>
            {NAMA_BULAN.map((nama, idx) => (
              <option key={nama} value={idx + 1}>
                {nama}
              </option>
            ))}
          </select>
          <select
            value={filterTahun}
            onChange={(e) => setFilterTahun(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
          >
            <option value="all">Semua Tahun</option>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={tunggakanRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 rounded-lg whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Ekspor Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={tunggakanRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 rounded-lg whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Ekspor PDF
          </button>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Jumlah Siswa Menunggak (Sesuai Filter)</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
            {tunggakanRows.length} siswa
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Tunggakan</div>
          <div className="text-2xl font-bold text-red-700 font-mono tabular-nums mt-1">
            {formatRupiah(grandTotal)}
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Siswa</th>
                <th className="py-2.5 px-4 text-left font-semibold">Kelas</th>
                <th className="py-2.5 px-4 text-left font-semibold">No. HP Ortu</th>
                <th className="py-2.5 px-4 text-left font-semibold">Bulan Menunggak</th>
                <th className="py-2.5 px-4 text-right font-semibold">Total Tunggakan</th>
                {canTransact && (
                  <th className="py-2.5 px-4 text-right font-semibold">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tunggakanRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canTransact ? 6 : 5}
                    className="py-8 px-4 text-center text-sm text-slate-500"
                  >
                    Tidak ada siswa menunggak untuk filter yang dipilih.
                  </td>
                </tr>
              ) : (
                tunggakanRows.map((row) => (
                  <tr key={row.siswa.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{row.siswa.nama}</div>
                      <div className="text-xs font-mono text-slate-500">{row.siswa.nis}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{row.kelasNama}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600">
                      {row.siswa.noHpOrtu || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs">
                      {row.bulanMenunggak.join(', ')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-red-700 whitespace-nowrap">
                      {formatRupiah(row.totalTunggakan)}
                    </td>
                    {canTransact && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onBayarSiswa(row.siswa.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Bayar
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

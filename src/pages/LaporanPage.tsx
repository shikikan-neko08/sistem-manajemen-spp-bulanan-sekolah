import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useSppData } from '../contexts/SppDataContext.tsx';
import {
  formatRupiah,
  formatTanggalSingkat,
  NAMA_BULAN,
  namaBulan,
  todayIsoDate,
} from '../lib/format.ts';
import { eksporLaporanExcel, eksporLaporanPdf } from '../services/exportService.ts';

type LaporanTab = 'harian' | 'bulanan' | 'kelas';

export function LaporanPage() {
  const { sekolah, kelasList, siswaList, tagihanList, pembayaranList } = useSppData();
  const [tab, setTab] = useState<LaporanTab>('harian');

  const now = new Date();
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [selectedTahun, setSelectedTahun] = useState(now.getFullYear());
  const [kelasFilterBulan, setKelasFilterBulan] = useState<string>('all');

  const pembayaranSah = useMemo(
    () => pembayaranList.filter((p) => p.status === 'sah'),
    [pembayaranList]
  );

  // 1. Rekap Harian
  const harianData = useMemo(() => {
    const filtered = pembayaranSah
      .filter((p) => p.tanggalBayar >= startDate && p.tanggalBayar <= endDate)
      .sort((a, b) => a.tanggalBayar.localeCompare(b.tanggalBayar));

    const total = filtered.reduce((acc, p) => acc + p.totalBayar, 0);
    const totalTunai = filtered
      .filter((p) => p.metode === 'tunai')
      .reduce((acc, p) => acc + p.totalBayar, 0);
    const totalTransfer = filtered
      .filter((p) => p.metode === 'transfer')
      .reduce((acc, p) => acc + p.totalBayar, 0);

    return { rows: filtered, total, totalTunai, totalTransfer };
  }, [pembayaranSah, startDate, endDate]);

  // 2. Rekap Bulanan
  const bulananData = useMemo(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      const prefix = `${selectedTahun}-${String(m).padStart(2, '0')}`;
      const list = pembayaranSah.filter((p) => p.tanggalBayar.startsWith(prefix));
      const tunai = list
        .filter((p) => p.metode === 'tunai')
        .reduce((acc, p) => acc + p.totalBayar, 0);
      const transfer = list
        .filter((p) => p.metode === 'transfer')
        .reduce((acc, p) => acc + p.totalBayar, 0);
      return {
        bulan: m,
        nama: namaBulan(m),
        jumlahTransaksi: list.length,
        tunai,
        transfer,
        total: tunai + transfer,
      };
    });
  }, [pembayaranSah, selectedTahun]);

  const totalTahunan = useMemo(
    () => bulananData.reduce((acc, r) => acc + r.total, 0),
    [bulananData]
  );

  // 3. Rekap Per Kelas
  const perKelasData = useMemo(() => {
    return kelasList.map((k) => {
      const siswaKelas = siswaList.filter(
        (s) => s.kelasId === k.id && s.statusAktif === 'aktif'
      ).length;
      const tagihanKelas = tagihanList.filter(
        (t) =>
          t.kelasId === k.id &&
          t.tahun === selectedTahun &&
          (kelasFilterBulan === 'all' || t.bulan === Number(kelasFilterBulan))
      );
      const totalTagihan = tagihanKelas.reduce((acc, t) => acc + t.nominalTagihan, 0);
      const totalTerbayar = tagihanKelas.reduce((acc, t) => acc + t.totalTerbayar, 0);
      const totalTunggakan = tagihanKelas.reduce((acc, t) => acc + t.sisaTagihan, 0);
      const lunasCount = tagihanKelas.filter((t) => t.status === 'lunas').length;

      return {
        kelasId: k.id,
        kelasNama: k.nama,
        siswaKelas,
        jumlahTagihan: tagihanKelas.length,
        lunasCount,
        totalTagihan,
        totalTerbayar,
        totalTunggakan,
      };
    });
  }, [kelasList, siswaList, tagihanList, selectedTahun, kelasFilterBulan]);

  const handleExportExcel = () => {
    if (tab === 'harian') {
      eksporLaporanExcel(
        harianData.rows.map((p, i) => ({
          No: i + 1,
          'No Kwitansi': p.noKwitansi,
          Tanggal: p.tanggalBayar,
          NIS: p.siswaNis,
          Siswa: p.siswaNama,
          Kelas: p.kelasNama,
          Metode: p.metode,
          Rincian: p.rincianBulan,
          'Nominal (Rp)': p.totalBayar,
          Petugas: p.petugasNama,
        })),
        'Laporan Harian',
        `laporan-harian-${startDate}_${endDate}.xlsx`
      );
    } else if (tab === 'bulanan') {
      eksporLaporanExcel(
        bulananData.map((b) => ({
          Bulan: b.nama,
          'Jumlah Transaksi': b.jumlahTransaksi,
          'Tunai (Rp)': b.tunai,
          'Transfer (Rp)': b.transfer,
          'Total Pemasukan (Rp)': b.total,
        })),
        'Laporan Bulanan',
        `laporan-bulanan-${selectedTahun}.xlsx`
      );
    } else {
      eksporLaporanExcel(
        perKelasData.map((k) => ({
          Kelas: k.kelasNama,
          'Siswa Aktif': k.siswaKelas,
          'Tagihan Terbit': k.jumlahTagihan,
          'Tagihan Lunas': k.lunasCount,
          'Total Tagihan (Rp)': k.totalTagihan,
          'Total Terbayar (Rp)': k.totalTerbayar,
          'Sisa Tunggakan (Rp)': k.totalTunggakan,
        })),
        'Laporan Per Kelas',
        `laporan-per-kelas-${selectedTahun}.xlsx`
      );
    }
  };

  const handleExportPdf = () => {
    if (tab === 'harian') {
      eksporLaporanPdf({
        judul: 'LAPORAN PEMASUKAN SPP HARIAN',
        subjudul: `Periode: ${formatTanggalSingkat(startDate)} s.d. ${formatTanggalSingkat(endDate)}`,
        columns: ['No. Kwitansi', 'Tanggal', 'Siswa', 'Kelas', 'Metode', 'Nominal'],
        rows: harianData.rows.map((p) => [
          p.noKwitansi,
          formatTanggalSingkat(p.tanggalBayar),
          `${p.siswaNama} (${p.siswaNis})`,
          p.kelasNama,
          p.metode.toUpperCase(),
          formatRupiah(p.totalBayar),
        ]),
        ringkasan: [
          `Total Tunai: ${formatRupiah(harianData.totalTunai)} | Total Transfer: ${formatRupiah(
            harianData.totalTransfer
          )}`,
          `Total Pemasukan Sah: ${formatRupiah(harianData.total)} (${harianData.rows.length} transaksi)`,
        ],
        filename: `laporan-harian-${startDate}_${endDate}.pdf`,
        sekolah,
      });
    } else if (tab === 'bulanan') {
      eksporLaporanPdf({
        judul: `REKAP PEMASUKAN SPP BULANAN TAHUN ${selectedTahun}`,
        subjudul: 'Berdasarkan transaksi pembayaran berstatus sah',
        columns: ['Bulan', 'Transaksi', 'Tunai', 'Transfer', 'Total Pemasukan'],
        rows: bulananData.map((b) => [
          b.nama,
          b.jumlahTransaksi,
          formatRupiah(b.tunai),
          formatRupiah(b.transfer),
          formatRupiah(b.total),
        ]),
        ringkasan: [`Total Pemasukan Tahun ${selectedTahun}: ${formatRupiah(totalTahunan)}`],
        filename: `laporan-bulanan-${selectedTahun}.pdf`,
        sekolah,
      });
    } else {
      const sumBayar = perKelasData.reduce((a, k) => a + k.totalTerbayar, 0);
      const sumTunggak = perKelasData.reduce((a, k) => a + k.totalTunggakan, 0);
      eksporLaporanPdf({
        judul: 'REKAP PEMASUKAN & TUNGGAKAN SPP PER KELAS',
        subjudul: `Tahun ${selectedTahun} · ${
          kelasFilterBulan === 'all' ? 'Semua Bulan' : namaBulan(Number(kelasFilterBulan))
        }`,
        columns: ['Kelas', 'Siswa', 'Lunas', 'Total Tagihan', 'Terbayar', 'Tunggakan'],
        rows: perKelasData.map((k) => [
          k.kelasNama,
          k.siswaKelas,
          `${k.lunasCount}/${k.jumlahTagihan}`,
          formatRupiah(k.totalTagihan),
          formatRupiah(k.totalTerbayar),
          formatRupiah(k.totalTunggakan),
        ]),
        ringkasan: [
          `Total Terbayar: ${formatRupiah(sumBayar)}`,
          `Total Tunggakan: ${formatRupiah(sumTunggak)}`,
        ],
        filename: `laporan-per-kelas-${selectedTahun}.pdf`,
        sekolah,
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Tabs & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {[
            { id: 'harian' as const, label: 'Rekap Harian' },
            { id: 'bulanan' as const, label: 'Rekap Bulanan' },
            { id: 'kelas' as const, label: 'Rekap Per Kelas' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Ekspor Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Ekspor PDF
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        {tab === 'harian' ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Dari:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Sampai:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="ml-auto flex flex-wrap gap-4 text-xs">
              <span>
                Tunai:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {formatRupiah(harianData.totalTunai)}
                </strong>
              </span>
              <span>
                Transfer:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {formatRupiah(harianData.totalTransfer)}
                </strong>
              </span>
              <span>
                Total:{' '}
                <strong className="font-mono tabular-nums text-teal-800">
                  {formatRupiah(harianData.total)}
                </strong>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Tahun:</span>
              <select
                value={selectedTahun}
                onChange={(e) => setSelectedTahun(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-mono"
              >
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
            {tab === 'kelas' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">Bulan Tagihan:</span>
                <select
                  value={kelasFilterBulan}
                  onChange={(e) => setKelasFilterBulan(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">Semua Bulan</option>
                  {NAMA_BULAN.map((nama, idx) => (
                    <option key={nama} value={idx + 1}>
                      {nama}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tab === 'bulanan' && (
              <div className="ml-auto text-xs">
                Total Pemasukan {selectedTahun}:{' '}
                <strong className="font-mono tabular-nums text-teal-800">
                  {formatRupiah(totalTahunan)}
                </strong>
              </div>
            )}
          </>
        )}
      </div>

      {/* Konten Tabel Laporan */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {tab === 'harian' && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">No. Kwitansi</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Tanggal</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Siswa</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Kelas</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Metode</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Petugas</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {harianData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-sm text-slate-500">
                      Tidak ada transaksi sah pada rentang tanggal ini.
                    </td>
                  </tr>
                ) : (
                  harianData.rows.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums">{p.noKwitansi}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatTanggalSingkat(p.tanggalBayar)}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {p.siswaNama}{' '}
                        <span className="font-mono text-xs font-normal text-slate-500">
                          ({p.siswaNis})
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{p.kelasNama}</td>
                      <td className="py-2.5 px-4 text-xs capitalize text-slate-700">{p.metode}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{p.petugasNama}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatRupiah(p.totalBayar)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === 'bulanan' && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Bulan</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Jumlah Transaksi</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Tunai</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Transfer</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Total Pemasukan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bulananData.map((b) => (
                  <tr key={b.bulan}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{b.nama}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {b.jumlahTransaksi}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatRupiah(b.tunai)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatRupiah(b.transfer)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-teal-800">
                      {formatRupiah(b.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'kelas' && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Kelas</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Siswa Aktif</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Tagihan Lunas</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Total Tagihan</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Terbayar</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Tunggakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {perKelasData.map((k) => (
                  <tr key={k.kelasId}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{k.kelasNama}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {k.siswaKelas}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {k.lunasCount} / {k.jumlahTagihan}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {formatRupiah(k.totalTagihan)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {formatRupiah(k.totalTerbayar)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-red-700">
                      {formatRupiah(k.totalTunggakan)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

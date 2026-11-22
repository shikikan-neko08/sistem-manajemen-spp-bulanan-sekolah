import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Plus,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { KwitansiPrintModal } from '../components/KwitansiPrintModal.tsx';
import { SiswaFormModal } from '../components/SiswaFormModal.tsx';
import { StatusPembayaranBadge } from '../components/StatusBadge.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { formatRupiah, formatTanggalSingkat, namaBulan } from '../lib/format.ts';
import { seedContohData } from '../services/seeder.ts';
import type { PageRoute, Pembayaran } from '../types/spp.ts';

export function DashboardPage({ onNavigate }: { onNavigate: (r: PageRoute) => void }) {
  const { profile, canManageMaster, canTransact } = useAuth();
  const {
    sekolah,
    kelasList,
    siswaList,
    tagihanList,
    pembayaranList,
    pembayaranOrtuList,
    loadingData,
  } = useSppData();

  const pendingOrtuCount = useMemo(
    () => pembayaranOrtuList.filter((p) => p.status === 'menunggu_verifikasi').length,
    [pembayaranOrtuList]
  );

  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [selectedKwitansi, setSelectedKwitansi] = useState<Pembayaran | null>(null);
  const [siswaModalOpen, setSiswaModalOpen] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const metrics = useMemo(() => {
    const pembayaranSah = pembayaranList.filter((p) => p.status === 'sah');
    const pemasukanBulanIni = pembayaranSah
      .filter((p) => p.tanggalBayar.startsWith(currentMonthPrefix))
      .reduce((acc, p) => acc + p.totalBayar, 0);

    const transaksiBulanIni = pembayaranSah.filter((p) =>
      p.tanggalBayar.startsWith(currentMonthPrefix)
    ).length;

    const tagihanBulanIni = tagihanList.filter(
      (t) => t.bulan === currentMonth && t.tahun === currentYear
    );
    const lunasBulanIni = tagihanBulanIni.filter((t) => t.status === 'lunas').length;
    const menunggakBulanIni = tagihanBulanIni.filter((t) => t.status !== 'lunas').length;

    const totalTunggakanAktif = tagihanList
      .filter((t) => t.status !== 'lunas')
      .reduce((acc, t) => acc + t.sisaTagihan, 0);

    // Pemasukan per bulan pada tahun berjalan
    const monthlyTotals = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const prefix = `${currentYear}-${String(m).padStart(2, '0')}`;
      const total = pembayaranSah
        .filter((p) => p.tanggalBayar.startsWith(prefix))
        .reduce((acc, p) => acc + p.totalBayar, 0);
      return { bulan: m, label: namaBulan(m).slice(0, 3), total };
    });

    const maxMonthly = Math.max(1, ...monthlyTotals.map((m) => m.total));

    // Tunggakan per kelas
    const kelasMap = new Map(kelasList.map((k) => [k.id, k.nama]));
    const tunggakanPerKelasMap = new Map<string, { kelasNama: string; siswaCount: number; nominal: number }>();
    const siswaMenunggakPerKelas = new Map<string, Set<string>>();

    for (const t of tagihanList) {
      if (t.status === 'lunas' || t.sisaTagihan <= 0) continue;
      const kNama = kelasMap.get(t.kelasId) || 'Tanpa Kelas';
      const cur = tunggakanPerKelasMap.get(t.kelasId) || {
        kelasNama: kNama,
        siswaCount: 0,
        nominal: 0,
      };
      cur.nominal += t.sisaTagihan;
      const setSiswa = siswaMenunggakPerKelas.get(t.kelasId) || new Set<string>();
      setSiswa.add(t.siswaId);
      cur.siswaCount = setSiswa.size;
      siswaMenunggakPerKelas.set(t.kelasId, setSiswa);
      tunggakanPerKelasMap.set(t.kelasId, cur);
    }

    const tunggakanPerKelas = Array.from(tunggakanPerKelasMap.values()).sort(
      (a, b) => b.nominal - a.nominal
    );

    return {
      pemasukanBulanIni,
      transaksiBulanIni,
      lunasBulanIni,
      menunggakBulanIni,
      totalTagihanBulanIni: tagihanBulanIni.length,
      totalTunggakanAktif,
      monthlyTotals,
      maxMonthly,
      tunggakanPerKelas,
    };
  }, [pembayaranList, tagihanList, kelasList, currentMonth, currentYear, currentMonthPrefix]);

  const handleSeed = async () => {
    if (!profile) return;
    setSeeding(true);
    setSeedError(null);
    setSeedMessage(null);
    try {
      const res = await seedContohData({
        uid: profile.uid,
        nama: profile.nama,
        peran: profile.peran,
      });
      setSeedMessage(
        `Berhasil mengisi ${res.siswaCount} siswa, ${res.tagihanCount} tagihan, dan ${res.pembayaranCount} pembayaran contoh.`
      );
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Gagal mengisi data contoh.');
    } finally {
      setSeeding(false);
    }
  };

  if (loadingData) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Empty / Seeder Banner jika belum ada data siswa */}
      {siswaList.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Database Masih Kosong — Siap Diisi Data Contoh SMA
            </h2>
            <p className="text-sm text-slate-600">
              Anda dapat mengisi 204 data siswa (6 kelas), tarif SPP, tagihan 3 bulan, dan sampel
              pembayaran secara otomatis untuk langsung menguji seluruh fitur.
            </p>
          </div>
          {canManageMaster && (
            <button
              type="button"
              disabled={seeding}
              onClick={() => void handleSeed()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Database className="w-4 h-4" />
              {seeding ? 'Mengisi 204 Siswa...' : 'Isi Data Contoh (204 Siswa)'}
            </button>
          )}
        </div>
      )}

      {seedMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          {seedMessage}
        </div>
      )}
      {seedError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {seedError}
        </div>
      )}

      {canTransact && pendingOrtuCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-amber-950">
            <span className="font-semibold tabular-nums">{pendingOrtuCount}</span> konfirmasi
            pembayaran SPP dari Orang Tua / Wali menunggu verifikasi bendahara.
          </div>
          <button
            type="button"
            onClick={() => onNavigate('pembayaran')}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Tinjau &amp; Verifikasi
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Kartu KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pemasukan {namaBulan(currentMonth)} {currentYear}</span>
            <TrendingUp className="w-4 h-4 text-teal-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {formatRupiah(metrics.pemasukanBulanIni)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {metrics.transaksiBulanIni} transaksi sah bulan ini
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Siswa Lunas ({namaBulan(currentMonth)})</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {metrics.lunasBulanIni}
            <span className="text-sm font-normal text-slate-400">
              {' '}
              / {metrics.totalTagihanBulanIni}
            </span>
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            {metrics.totalTagihanBulanIni > 0
              ? `${Math.round((metrics.lunasBulanIni / metrics.totalTagihanBulanIni) * 100)}% tingkat pelunasan`
              : 'Belum ada tagihan bulan ini'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Menunggak ({namaBulan(currentMonth)})</span>
            <Users className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {metrics.menunggakBulanIni}
          </div>
          <div className="text-xs text-slate-500">
            Total {siswaList.filter((s) => s.statusAktif === 'aktif').length} siswa aktif terdaftar
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total Tunggakan Aktif</span>
            <AlertCircle className="w-4 h-4 text-red-700" />
          </div>
          <div className="text-2xl font-bold text-red-700 font-mono tabular-nums">
            {formatRupiah(metrics.totalTunggakanAktif)}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tunggakan')}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
          >
            Lihat daftar tunggakan <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Grafik Pemasukan Bulanan + Tunggakan per Kelas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Grafik Pemasukan SPP Tahun {currentYear}
              </h2>
              <p className="text-xs text-slate-500">
                Akumulasi pembayaran sah per bulan (tunai & transfer)
              </p>
            </div>
            {hoveredMonth !== null && (
              <div className="text-right">
                <div className="text-xs text-slate-500">{namaBulan(hoveredMonth)}</div>
                <div className="text-sm font-bold text-teal-800 font-mono tabular-nums">
                  {formatRupiah(metrics.monthlyTotals[hoveredMonth - 1]?.total || 0)}
                </div>
              </div>
            )}
          </div>

          <div className="h-56 flex items-end gap-2 sm:gap-3 pt-6 pb-2 border-b border-slate-200">
            {metrics.monthlyTotals.map((m) => {
              const pct = Math.round((m.total / metrics.maxMonthly) * 100);
              const isCurrent = m.bulan === currentMonth;
              return (
                <div
                  key={m.bulan}
                  onMouseEnter={() => setHoveredMonth(m.bulan)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group"
                >
                  <div className="w-full flex items-end justify-center h-full">
                    <div
                      style={{ height: `${m.total > 0 ? Math.max(6, pct) : 2}%` }}
                      className={`w-full max-w-[34px] rounded-t-md transition-colors ${
                        m.total === 0
                          ? 'bg-slate-100'
                          : isCurrent
                          ? 'bg-teal-700'
                          : 'bg-teal-600/75 group-hover:bg-teal-700'
                      }`}
                      title={`${namaBulan(m.bulan)}: ${formatRupiah(m.total)}`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      isCurrent ? 'text-teal-800 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Tunggakan per Kelas</h2>
            <button
              type="button"
              onClick={() => onNavigate('tunggakan')}
              className="text-xs font-medium text-teal-700 hover:underline"
            >
              Detail
            </button>
          </div>
          {metrics.tunggakanPerKelas.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Tidak ada tunggakan tercatat.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.tunggakanPerKelas.slice(0, 6).map((item) => (
                <div key={item.kelasNama} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{item.kelasNama}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {item.siswaCount} siswa menunggak
                    </div>
                  </div>
                  <div className="text-sm font-semibold font-mono tabular-nums text-red-700">
                    {formatRupiah(item.nominal)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transaksi Pembayaran Terbaru */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Transaksi Pembayaran Terbaru</h2>
            <p className="text-xs text-slate-500">Klik no. kwitansi untuk cetak atau unduh PDF</p>
          </div>
          {canTransact && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canManageMaster && (
                <button
                  type="button"
                  onClick={() => setSiswaModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Siswa Baru
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('tagihan')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Tagihan
              </button>
              <button
                type="button"
                onClick={() => onNavigate('pembayaran')}
                className="px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
              >
                Input Pembayaran
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">No. Kwitansi</th>
                <th className="py-2.5 px-4 text-left font-semibold">Tanggal</th>
                <th className="py-2.5 px-4 text-left font-semibold">Siswa</th>
                <th className="py-2.5 px-4 text-left font-semibold">Rincian</th>
                <th className="py-2.5 px-4 text-right font-semibold">Nominal</th>
                <th className="py-2.5 px-4 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pembayaranList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center text-sm text-slate-500">
                    Belum ada transaksi pembayaran tercatat.
                  </td>
                </tr>
              ) : (
                pembayaranList.slice(0, 8).map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4">
                      <button
                        type="button"
                        onClick={() => setSelectedKwitansi(p)}
                        className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-teal-700 hover:underline tabular-nums"
                      >
                        <Receipt className="w-3.5 h-3.5 shrink-0" />
                        {p.noKwitansi}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {formatTanggalSingkat(p.tanggalBayar)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{p.siswaNama}</div>
                      <div className="text-xs text-slate-500">
                        {p.kelasNama} · <span className="font-mono">{p.siswaNis}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {p.rincianBulan}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatRupiah(p.totalBayar)}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusPembayaranBadge status={p.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedKwitansi && (
        <KwitansiPrintModal
          pembayaran={selectedKwitansi}
          sekolah={sekolah}
          onClose={() => setSelectedKwitansi(null)}
        />
      )}

      {profile && (
        <SiswaFormModal
          open={siswaModalOpen}
          editingSiswa={null}
          kelasList={kelasList}
          semuaSiswa={siswaList}
          actor={{ uid: profile.uid, nama: profile.nama, peran: profile.peran }}
          onClose={() => setSiswaModalOpen(false)}
          onSuccess={(msg) => setSeedMessage(msg)}
        />
      )}
    </div>
  );
}

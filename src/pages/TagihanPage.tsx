import React, { useMemo, useState } from 'react';
import { CalendarPlus, Plus, Search, UserPlus, X } from 'lucide-react';
import { SiswaFormModal } from '../components/SiswaFormModal.tsx';
import { StatusTagihanBadge } from '../components/StatusBadge.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { formatRupiah, hitungDiskon, NAMA_BULAN, namaBulan } from '../lib/format.ts';
import { generateTagihanBulanan, tambahTagihanManual } from '../services/tagihanService.ts';
import type { StatusTagihan } from '../types/spp.ts';

export function TagihanPage() {
  const { profile, canManageMaster, canTransact } = useAuth();
  const { tahunAjaranAktif, kelasList, tarifList, siswaList, tagihanList } = useSppData();

  const now = new Date();
  const [selectedBulan, setSelectedBulan] = useState(now.getMonth() + 1);
  const [selectedTahun, setSelectedTahun] = useState(now.getFullYear());
  const [filterKelas, setFilterKelas] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | StatusTagihan>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  // Modal Tambah Siswa Baru
  const [siswaModalOpen, setSiswaModalOpen] = useState(false);

  // Modal Tambah Tagihan Manual (Per Siswa)
  const [tagihanModalOpen, setTagihanModalOpen] = useState(false);
  const [tSiswaId, setTSiswaId] = useState('');
  const [tBulan, setTBulan] = useState(now.getMonth() + 1);
  const [tTahun, setTTahun] = useState(now.getFullYear());
  const [tTarif, setTTarif] = useState('0');
  const [tDiskon, setTDiskon] = useState('0');
  const [tJatuhTempo, setTJatuhTempo] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`
  );
  const [savingTagihan, setSavingTagihan] = useState(false);
  const [tagihanModalError, setTagihanModalError] = useState<string | null>(null);

  const actor = useMemo(
    () => ({
      uid: profile?.uid || '',
      nama: profile?.nama || '',
      peran: profile?.peran || 'petugas',
    }),
    [profile]
  );

  const siswaMap = useMemo(() => new Map(siswaList.map((s) => [s.id, s])), [siswaList]);
  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);
  const activeSiswaList = useMemo(
    () => siswaList.filter((s) => s.statusAktif === 'aktif'),
    [siswaList]
  );

  const applyDefaultsForSiswa = (siswaId: string, bulan: number, tahun: number) => {
    const s = siswaMap.get(siswaId);
    if (!s || !tahunAjaranAktif) return;
    const tarifObj = tarifList.find(
      (t) => t.kelasId === s.kelasId && t.tahunAjaranId === tahunAjaranAktif.id
    );
    const tarifNominal = tarifObj?.nominal ?? 0;
    const { nominalDiskon } = hitungDiskon(tarifNominal, s.diskonTipe, s.diskonNilai);
    setTTarif(String(tarifNominal));
    setTDiskon(String(nominalDiskon));
    setTJatuhTempo(`${tahun}-${String(bulan).padStart(2, '0')}-10`);
  };

  const openTambahTagihanModal = () => {
    setTagihanModalError(null);
    const defaultSiswa = activeSiswaList[0];
    setTBulan(selectedBulan);
    setTTahun(selectedTahun);
    if (defaultSiswa) {
      setTSiswaId(defaultSiswa.id);
      applyDefaultsForSiswa(defaultSiswa.id, selectedBulan, selectedTahun);
    } else {
      setTSiswaId('');
      setTTarif('0');
      setTDiskon('0');
    }
    setTagihanModalOpen(true);
  };

  const filteredTagihan = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tagihanList
      .filter((t) => {
        if (t.bulan !== selectedBulan || t.tahun !== selectedTahun) return false;
        if (filterKelas !== 'all' && t.kelasId !== filterKelas) return false;
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        const s = siswaMap.get(t.siswaId);
        if (q) {
          const nama = (s?.nama || '').toLowerCase();
          const nis = (s?.nis || '').toLowerCase();
          if (!nama.includes(q) && !nis.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const na = siswaMap.get(a.siswaId)?.nama || '';
        const nb = siswaMap.get(b.siswaId)?.nama || '';
        return na.localeCompare(nb);
      });
  }, [tagihanList, selectedBulan, selectedTahun, filterKelas, filterStatus, searchQuery, siswaMap]);

  const summary = useMemo(() => {
    return filteredTagihan.reduce(
      (acc, t) => {
        acc.totalTagihan += t.nominalTagihan;
        acc.totalTerbayar += t.totalTerbayar;
        acc.sisa += t.sisaTagihan;
        return acc;
      },
      { totalTagihan: 0, totalTerbayar: 0, sisa: 0 }
    );
  }, [filteredTagihan]);

  const totalPages = Math.max(1, Math.ceil(filteredTagihan.length / PAGE_SIZE));
  const pagedTagihan = filteredTagihan.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleGenerateManual = async () => {
    if (!profile || !tahunAjaranAktif) return;
    setGenerating(true);
    setGenMessage(null);
    setGenError(null);
    try {
      const res = await generateTagihanBulanan({
        bulan: selectedBulan,
        tahun: selectedTahun,
        tahunAjaranId: tahunAjaranAktif.id,
        siswaList,
        kelasList,
        tarifList,
        existingTagihan: tagihanList,
        actor,
      });
      setGenMessage(
        `Proses generate ${namaBulan(selectedBulan)} ${selectedTahun} selesai: ${res.createdCount} tagihan baru dibuat, ${res.skippedCount} sudah ada (dilewati anti-ganda)${
          res.missingTarifCount > 0 ? `, ${res.missingTarifCount} siswa belum memiliki tarif kelas.` : '.'
        }`
      );
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Gagal generate tagihan bulanan.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveManualTagihan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tahunAjaranAktif) {
      setTagihanModalError('Tahun ajaran aktif belum tersedia.');
      return;
    }
    const siswa = siswaMap.get(tSiswaId);
    if (!siswa) {
      setTagihanModalError('Pilih siswa terlebih dahulu.');
      return;
    }
    setSavingTagihan(true);
    setTagihanModalError(null);
    setGenMessage(null);
    setGenError(null);
    try {
      await tambahTagihanManual({
        siswa,
        tahunAjaranId: tahunAjaranAktif.id,
        bulan: tBulan,
        tahun: tTahun,
        nominalTarif: Number(tTarif) || 0,
        nominalDiskon: Number(tDiskon) || 0,
        jatuhTempo: tJatuhTempo,
        actor,
      });
      setSelectedBulan(tBulan);
      setSelectedTahun(tTahun);
      setTagihanModalOpen(false);
      setGenMessage(
        `Tagihan manual ${namaBulan(tBulan)} ${tTahun} untuk ${siswa.nama} berhasil ditambahkan.`
      );
    } catch (err) {
      setTagihanModalError(err instanceof Error ? err.message : 'Gagal menambah tagihan.');
    } finally {
      setSavingTagihan(false);
    }
  };

  const previewNetTagihan = Math.max(
    0,
    (Number(tTarif) || 0) - Math.min(Number(tTarif) || 0, Number(tDiskon) || 0)
  );

  return (
    <div className="space-y-5">
      {/* Panel Generate & Tambah Tagihan */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Tagihan SPP Bulanan (Otomatis & Manual)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate tagihan massal untuk seluruh siswa aktif atau tambah tagihan per siswa secara
            manual tanpa risiko duplikasi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={selectedBulan}
            onChange={(e) => {
              setSelectedBulan(Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {NAMA_BULAN.map((nama, idx) => (
              <option key={nama} value={idx + 1}>
                {nama}
              </option>
            ))}
          </select>

          <select
            value={selectedTahun}
            onChange={(e) => {
              setSelectedTahun(Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
          >
            {[selectedTahun - 1, selectedTahun, selectedTahun + 1].map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          {canTransact && (
            <>
              <button
                type="button"
                disabled={!tahunAjaranAktif || activeSiswaList.length === 0}
                onClick={openTambahTagihanModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah Tagihan
              </button>

              <button
                type="button"
                disabled={generating || !tahunAjaranAktif}
                onClick={() => void handleGenerateManual()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <CalendarPlus className="w-4 h-4" />
                {generating ? 'Memproses...' : 'Generate Massal'}
              </button>
            </>
          )}

          {canManageMaster && (
            <button
              type="button"
              onClick={() => setSiswaModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              Siswa Baru
            </button>
          )}
        </div>
      </div>

      {genMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {genMessage}
        </div>
      )}
      {genError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {genError}
        </div>
      )}

      {/* Ringkasan Periode */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Tagihan ({filteredTagihan.length} siswa)</div>
          <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-1">
            {formatRupiah(summary.totalTagihan)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Sudah Terbayar</div>
          <div className="text-lg font-bold text-emerald-700 font-mono tabular-nums mt-1">
            {formatRupiah(summary.totalTerbayar)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Sisa Belum Terbayar</div>
          <div className="text-lg font-bold text-red-700 font-mono tabular-nums mt-1">
            {formatRupiah(summary.sisa)}
          </div>
        </div>
      </div>

      {/* Tabel Tagihan */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Cari nama atau NIS siswa..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <select
            value={filterKelas}
            onChange={(e) => {
              setFilterKelas(e.target.value);
              setPage(1);
            }}
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
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as 'all' | StatusTagihan);
              setPage(1);
            }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">Semua Status</option>
            <option value="belum_bayar">Belum Bayar</option>
            <option value="sebagian">Sebagian</option>
            <option value="lunas">Lunas</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Siswa</th>
                <th className="py-2.5 px-4 text-left font-semibold">Kelas</th>
                <th className="py-2.5 px-4 text-right font-semibold">Tarif</th>
                <th className="py-2.5 px-4 text-right font-semibold">Diskon</th>
                <th className="py-2.5 px-4 text-right font-semibold">Tagihan</th>
                <th className="py-2.5 px-4 text-right font-semibold">Terbayar</th>
                <th className="py-2.5 px-4 text-right font-semibold">Sisa</th>
                <th className="py-2.5 px-4 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedTagihan.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 px-4 text-center text-sm text-slate-500">
                    Belum ada tagihan untuk periode {namaBulan(selectedBulan)} {selectedTahun}. Klik
                    &ldquo;Tambah Tagihan&rdquo; atau &ldquo;Generate Massal&rdquo; di atas.
                  </td>
                </tr>
              ) : (
                pagedTagihan.map((t) => {
                  const s = siswaMap.get(t.siswaId);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{s?.nama || t.siswaId}</div>
                        <div className="text-xs font-mono text-slate-500">{s?.nis || '-'}</div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{kelasMap.get(t.kelasId) || '-'}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatRupiah(t.nominalTarif)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-teal-700">
                        {t.nominalDiskon > 0 ? `-${formatRupiah(t.nominalDiskon)}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium text-slate-900">
                        {formatRupiah(t.nominalTagihan)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                        {formatRupiah(t.totalTerbayar)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatRupiah(t.sisaTagihan)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusTagihanBadge status={t.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="tabular-nums">
            Menampilkan {pagedTagihan.length} dari {filteredTagihan.length} tagihan
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
            >
              Sebelumnya
            </button>
            <span className="tabular-nums">
              Hal {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>

      {/* Modal Tambah Tagihan Manual Per Siswa */}
      {tagihanModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={(e) => void handleSaveManualTagihan(e)}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Tambah Tagihan SPP Siswa
              </h3>
              <button
                type="button"
                onClick={() => setTagihanModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {tagihanModalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {tagihanModalError}
              </div>
            )}

            <div className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">Siswa Aktif</label>
                  {canManageMaster && (
                    <button
                      type="button"
                      onClick={() => setSiswaModalOpen(true)}
                      className="text-xs font-medium text-teal-700 hover:underline"
                    >
                      + Tambah Siswa Baru
                    </button>
                  )}
                </div>
                <select
                  value={tSiswaId}
                  onChange={(e) => {
                    setTSiswaId(e.target.value);
                    applyDefaultsForSiswa(e.target.value, tBulan, tTahun);
                  }}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {activeSiswaList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nis} — {s.nama} ({kelasMap.get(s.kelasId) || '-'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bulan</label>
                  <select
                    value={tBulan}
                    onChange={(e) => {
                      const b = Number(e.target.value);
                      setTBulan(b);
                      setTJatuhTempo(`${tTahun}-${String(b).padStart(2, '0')}-10`);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {NAMA_BULAN.map((nama, idx) => (
                      <option key={nama} value={idx + 1}>
                        {nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tahun</label>
                  <input
                    type="number"
                    min={2020}
                    max={2100}
                    value={tTahun}
                    onChange={(e) => {
                      const y = Number(e.target.value) || now.getFullYear();
                      setTTahun(y);
                      setTJatuhTempo(`${y}-${String(tBulan).padStart(2, '0')}-10`);
                    }}
                    required
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tarif SPP (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tTarif}
                    onChange={(e) => setTTarif(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Diskon / Beasiswa (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tDiskon}
                    onChange={(e) => setTDiskon(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jatuh Tempo
                  </label>
                  <input
                    type="date"
                    value={tJatuhTempo}
                    onChange={(e) => setTJatuhTempo(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-right">
                  <div className="text-[11px] text-slate-500">Total Tagihan Bersih</div>
                  <div className="text-base font-bold font-mono tabular-nums text-teal-800">
                    {formatRupiah(previewNetTagihan)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setTagihanModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingTagihan}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
              >
                {savingTagihan ? 'Menyimpan...' : 'Simpan Tagihan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Tambah Siswa Baru (terhubung langsung) */}
      <SiswaFormModal
        open={siswaModalOpen}
        editingSiswa={null}
        kelasList={kelasList}
        semuaSiswa={siswaList}
        actor={actor}
        onClose={() => setSiswaModalOpen(false)}
        onSuccess={(msg, savedId) => {
          setGenMessage(msg);
          if (tagihanModalOpen) {
            setTSiswaId(savedId);
          }
        }}
      />
    </div>
  );
}

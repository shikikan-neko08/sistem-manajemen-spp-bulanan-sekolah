import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CheckSquare, CreditCard, Receipt, Search, X } from 'lucide-react';
import { KwitansiPrintModal } from '../components/KwitansiPrintModal.tsx';
import { StatusPembayaranBadge, StatusTagihanBadge } from '../components/StatusBadge.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import {
  formatRupiah,
  formatTanggalSingkat,
  namaBulan,
  todayIsoDate,
} from '../lib/format.ts';
import { batalkanPembayaran, prosesPembayaran } from '../services/pembayaranService.ts';
import type {
  MetodePembayaran,
  Pembayaran,
  PembayaranDetail,
  TagihanSpp,
} from '../types/spp.ts';

interface Props {
  preselectedSiswaId?: string | null;
  onClearPreselect?: () => void;
}

export function PembayaranPage({ preselectedSiswaId, onClearPreselect }: Props) {
  const { profile, canTransact } = useAuth();
  const { sekolah, kelasList, siswaList, tagihanList, pembayaranList } = useSppData();

  const [siswaSearch, setSiswaSearch] = useState('');
  const [selectedSiswaId, setSelectedSiswaId] = useState<string>('');
  const [selectedTagihanMap, setSelectedTagihanMap] = useState<Record<string, number>>({});
  const [metode, setMetode] = useState<MetodePembayaran>('tunai');
  const [tanggalBayar, setTanggalBayar] = useState(todayIsoDate());
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Kwitansi modal
  const [activeKwitansi, setActiveKwitansi] = useState<{
    pembayaran: Pembayaran;
    details?: PembayaranDetail[];
  } | null>(null);

  // Riwayat filter & pembatalan modal
  const [historySearch, setHistorySearch] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Pembayaran | null>(null);
  const [alasanBatal, setAlasanBatal] = useState('');
  const [canceling, setCanceling] = useState(false);

  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);
  const siswaMap = useMemo(() => new Map(siswaList.map((s) => [s.id, s])), [siswaList]);

  useEffect(() => {
    if (preselectedSiswaId) {
      setSelectedSiswaId(preselectedSiswaId);
      setSelectedTagihanMap({});
      onClearPreselect?.();
    }
  }, [preselectedSiswaId, onClearPreselect]);

  const matchingSiswa = useMemo(() => {
    const q = siswaSearch.trim().toLowerCase();
    const list = siswaList.filter((s) => s.statusAktif === 'aktif');
    if (!q) return list.slice(0, 12);
    return list
      .filter((s) => s.nama.toLowerCase().includes(q) || s.nis.toLowerCase().includes(q))
      .slice(0, 15);
  }, [siswaList, siswaSearch]);

  const selectedSiswa = siswaMap.get(selectedSiswaId) || null;

  const unpaidTagihan = useMemo(() => {
    if (!selectedSiswaId) return [];
    return tagihanList
      .filter((t) => t.siswaId === selectedSiswaId && t.status !== 'lunas' && t.sisaTagihan > 0)
      .sort((a, b) => a.tahun * 100 + a.bulan - (b.tahun * 100 + b.bulan));
  }, [tagihanList, selectedSiswaId]);

  const toggleTagihan = (t: TagihanSpp) => {
    setSelectedTagihanMap((prev) => {
      const next = { ...prev };
      if (next[t.id] !== undefined) {
        delete next[t.id];
      } else {
        next[t.id] = t.sisaTagihan;
      }
      return next;
    });
  };

  const updateNominal = (tagihanId: string, val: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Math.round(val || 0)));
    setSelectedTagihanMap((prev) => ({
      ...prev,
      [tagihanId]: clamped,
    }));
  };

  const totalAkanDibayar = useMemo(() => {
    return Object.values(selectedTagihanMap).reduce((acc, v) => acc + (v || 0), 0);
  }, [selectedTagihanMap]);

  const handleSubmitPembayaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedSiswa) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const items = unpaidTagihan
      .filter((t) => (selectedTagihanMap[t.id] || 0) > 0)
      .map((t) => ({ tagihan: t, bayarNominal: selectedTagihanMap[t.id] }));

    if (items.length === 0) {
      setErrorMsg('Centang minimal satu bulan tagihan dengan nominal lebih dari Rp 0.');
      return;
    }

    setSubmitting(true);
    try {
      const kelasNama = kelasMap.get(selectedSiswa.kelasId) || '-';
      const result = await prosesPembayaran({
        siswa: selectedSiswa,
        kelasNama,
        items,
        metode,
        tanggalBayar,
        catatan,
        actor: { uid: profile.uid, nama: profile.nama, peran: profile.peran },
      });

      setSelectedTagihanMap({});
      setCatatan('');
      setSuccessMsg(
        `Pembayaran ${result.pembayaran.noKwitansi} sebesar ${formatRupiah(
          result.pembayaran.totalBayar
        )} berhasil dicatat.`
      );
      setActiveKwitansi({ pembayaran: result.pembayaran, details: result.details });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pembayaran.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !cancelTarget) return;
    setCanceling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await batalkanPembayaran(cancelTarget, alasanBatal, {
        uid: profile.uid,
        nama: profile.nama,
        peran: profile.peran,
      });
      setSuccessMsg(
        `Transaksi ${cancelTarget.noKwitansi} berhasil dibatalkan dan saldo tagihan dikembalikan.`
      );
      setCancelTarget(null);
      setAlasanBatal('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membatalkan pembayaran.');
    } finally {
      setCanceling(false);
    }
  };

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return pembayaranList.slice(0, 40);
    return pembayaranList
      .filter(
        (p) =>
          p.noKwitansi.toLowerCase().includes(q) ||
          p.siswaNama.toLowerCase().includes(q) ||
          p.siswaNis.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [pembayaranList, historySearch]);

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {successMsg}
        </div>
      )}

      {/* Form Input Pembayaran */}
      {canTransact && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Pilih Siswa */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">1. Pilih Siswa</h2>
              <p className="text-xs text-slate-500">Cari berdasarkan nama atau NIS siswa aktif</p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={siswaSearch}
                onChange={(e) => setSiswaSearch(e.target.value)}
                placeholder="Ketik NIS atau nama siswa..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {matchingSiswa.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 text-center">
                  Siswa aktif tidak ditemukan.
                </div>
              ) : (
                matchingSiswa.map((s) => {
                  const active = s.id === selectedSiswaId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSiswaId(s.id);
                        setSelectedTagihanMap({});
                      }}
                      className={`w-full px-3.5 py-2.5 text-left transition-colors flex items-center justify-between gap-2 ${
                        active ? 'bg-teal-50 text-teal-900' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{s.nama}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {s.nis} · {kelasMap.get(s.kelasId) || '-'}
                        </div>
                      </div>
                      {active && (
                        <span className="text-xs font-semibold text-teal-700 shrink-0">Dipilih</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Pilih Bulan & Input Nominal (Cicilan / Multi-Bulan) */}
          <form
            onSubmit={(e) => void handleSubmitPembayaran(e)}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  2. Tagihan & Pembayaran (Cicilan / Multi-Bulan)
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedSiswa
                    ? `${selectedSiswa.nama} (${selectedSiswa.nis}) · ${
                        kelasMap.get(selectedSiswa.kelasId) || '-'
                      }`
                    : 'Pilih siswa di sebelah kiri terlebih dahulu'}
                </p>
              </div>
              {unpaidTagihan.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const all: Record<string, number> = {};
                    unpaidTagihan.forEach((t) => {
                      all[t.id] = t.sisaTagihan;
                    });
                    setSelectedTagihanMap(all);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Pilih Semua Bulan
                </button>
              )}
            </div>

            {!selectedSiswa ? (
              <div className="py-12 text-center text-sm text-slate-500">
                Belum ada siswa dipilih.
              </div>
            ) : unpaidTagihan.length === 0 ? (
              <div className="py-10 text-center text-sm text-emerald-700 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                Seluruh tagihan SPP untuk {selectedSiswa.nama} sudah lunas.
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {unpaidTagihan.map((t) => {
                    const checked = selectedTagihanMap[t.id] !== undefined;
                    return (
                      <div
                        key={t.id}
                        className={`p-3 border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          checked ? 'border-teal-600 bg-teal-50/40' : 'border-slate-200'
                        }`}
                      >
                        <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTagihan(t)}
                            className="mt-1"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {namaBulan(t.bulan)} {t.tahun}
                              </span>
                              <StatusTagihanBadge status={t.status} />
                            </div>
                            <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                              Tagihan {formatRupiah(t.nominalTagihan)} · Terbayar{' '}
                              {formatRupiah(t.totalTerbayar)} · Sisa{' '}
                              <span className="font-semibold text-red-700">
                                {formatRupiah(t.sisaTagihan)}
                              </span>
                            </div>
                          </div>
                        </label>

                        {checked && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-slate-500">Bayar:</span>
                            <input
                              type="number"
                              min={1}
                              max={t.sisaTagihan}
                              value={selectedTagihanMap[t.id]}
                              onChange={(e) =>
                                updateNominal(t.id, Number(e.target.value), t.sisaTagihan)
                              }
                              className="w-36 px-2.5 py-1.5 text-sm font-mono tabular-nums border border-slate-300 rounded-md bg-white text-right"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tanggal Bayar
                    </label>
                    <input
                      type="date"
                      value={tanggalBayar}
                      onChange={(e) => setTanggalBayar(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Metode Pembayaran
                    </label>
                    <select
                      value={metode}
                      onChange={(e) => setMetode(e.target.value as MetodePembayaran)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="tunai">Tunai (Kas Loket)</option>
                      <option value="transfer">Transfer Bank</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Catatan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      placeholder="Mis. Transfer BCA"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
                  <div>
                    <div className="text-xs text-slate-500">Total Pembayaran</div>
                    <div className="text-xl font-bold text-teal-800 font-mono tabular-nums">
                      {formatRupiah(totalAkanDibayar)}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || totalAkanDibayar <= 0}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <CreditCard className="w-4 h-4" />
                    {submitting ? 'Memproses...' : 'Simpan & Terbitkan Kwitansi'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Riwayat Pembayaran & Kwitansi */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Riwayat Pembayaran & Kwitansi
            </h2>
            <p className="text-xs text-slate-500">
              Pembayaran yang sudah dicatat tidak dapat dihapus; koreksi hanya melalui pembatalan
              beralasan.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Cari no. kwitansi / siswa..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">No. Kwitansi</th>
                <th className="py-2.5 px-4 text-left font-semibold">Tanggal</th>
                <th className="py-2.5 px-4 text-left font-semibold">Siswa</th>
                <th className="py-2.5 px-4 text-left font-semibold">Rincian Bulan</th>
                <th className="py-2.5 px-4 text-left font-semibold">Metode</th>
                <th className="py-2.5 px-4 text-right font-semibold">Total</th>
                <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                <th className="py-2.5 px-4 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 px-4 text-center text-sm text-slate-500">
                    Belum ada riwayat pembayaran.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900 tabular-nums">
                      {p.noKwitansi}
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
                    <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs">
                      <div>{p.rincianBulan}</div>
                      {p.status === 'dibatalkan' && p.alasanBatal && (
                        <div className="text-red-700 mt-0.5">Alasan batal: {p.alasanBatal}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 capitalize">{p.metode}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatRupiah(p.totalBayar)}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusPembayaranBadge status={p.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveKwitansi({ pembayaran: p })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Kwitansi
                      </button>
                      {canTransact && p.status === 'sah' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelTarget(p);
                            setAlasanBatal('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Batalkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Pembatalan Beralasan */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleConfirmCancel(e)}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">Batalkan Transaksi Pembayaran</h3>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-600 space-y-1">
              <div>
                No. Kwitansi:{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {cancelTarget.noKwitansi}
                </span>
              </div>
              <div>
                Siswa: <span className="font-semibold text-slate-900">{cancelTarget.siswaNama}</span>{' '}
                ({formatRupiah(cancelTarget.totalBayar)})
              </div>
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2.5 mt-2">
                Pembatalan akan mengembalikan saldo sisa tagihan siswa dan tercatat permanen di log
                aktivitas.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Alasan Pembatalan (Wajib, min. 5 karakter)
              </label>
              <textarea
                rows={3}
                required
                minLength={5}
                value={alasanBatal}
                onChange={(e) => setAlasanBatal(e.target.value)}
                placeholder="Contoh: Salah input nominal atau transfer tidak masuk mutasi."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={canceling || alasanBatal.trim().length < 5}
                className="px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg"
              >
                {canceling ? 'Membatalkan...' : 'Konfirmasi Batalkan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeKwitansi && (
        <KwitansiPrintModal
          pembayaran={activeKwitansi.pembayaran}
          initialDetails={activeKwitansi.details}
          sekolah={sekolah}
          onClose={() => setActiveKwitansi(null)}
        />
      )}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import {
  Check,
  Database,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { SiswaFormModal } from '../components/SiswaFormModal.tsx';
import { StatusSiswaBadge } from '../components/StatusBadge.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { formatRupiah } from '../lib/format.ts';
import {
  hapusKelas,
  hapusSiswa,
  setTahunAjaranAktif,
  simpanKelas,
  simpanTarifSpp,
  tambahTahunAjaran,
} from '../services/masterService.ts';
import { seedContohData } from '../services/seeder.ts';
import type {
  Kelas,
  Siswa,
  TingkatKelas,
} from '../types/spp.ts';

type MasterTab = 'siswa' | 'kelas' | 'tarif';

export function MasterDataPage() {
  const { profile, canManageMaster } = useAuth();
  const {
    tahunAjaranList,
    tahunAjaranAktif,
    kelasList,
    tarifList,
    siswaList,
  } = useSppData();

  const [tab, setTab] = useState<MasterTab>('siswa');
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Siswa filter & pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKelas, setFilterKelas] = useState('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Siswa form modal
  const [siswaModalOpen, setSiswaModalOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);

  // Tahun ajaran & kelas form
  const [newTaNama, setNewTaNama] = useState('');
  const [newTaAktif, setNewTaAktif] = useState(true);
  const [kelasForm, setKelasForm] = useState<{ id?: string; nama: string; tingkat: TingkatKelas }>({
    nama: '',
    tingkat: '10',
  });

  // Tarif form state
  const [tarifDrafts, setTarifDrafts] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);

  const actor = useMemo(
    () => ({
      uid: profile?.uid || '',
      nama: profile?.nama || '',
      peran: profile?.peran || 'admin',
    }),
    [profile]
  );

  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);

  const filteredSiswa = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return siswaList.filter((s) => {
      if (filterKelas !== 'all' && s.kelasId !== filterKelas) return false;
      if (filterStatus !== 'all' && s.statusAktif !== filterStatus) return false;
      if (
        q &&
        !s.nama.toLowerCase().includes(q) &&
        !s.nis.toLowerCase().includes(q) &&
        !(s.emailOrtu || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [siswaList, searchQuery, filterKelas, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredSiswa.length / PAGE_SIZE));
  const pagedSiswa = filteredSiswa.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAddSiswa = () => {
    setEditingSiswa(null);
    setSiswaModalOpen(true);
  };

  const openEditSiswa = (s: Siswa) => {
    setEditingSiswa(s);
    setSiswaModalOpen(true);
  };

  const handleDeleteSiswa = async (s: Siswa) => {
    setErrorMsg(null);
    setNotice(null);
    try {
      await hapusSiswa(s, actor);
      setNotice(`Siswa ${s.nama} telah dihapus.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus siswa.');
    }
  };

  const handleAddTa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    try {
      await tambahTahunAjaran(newTaNama, newTaAktif, tahunAjaranList, actor);
      setNewTaNama('');
      setNotice('Tahun ajaran berhasil ditambahkan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah tahun ajaran.');
    }
  };

  const handleSaveKelas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tahunAjaranAktif) {
      setErrorMsg('Buat tahun ajaran aktif terlebih dahulu.');
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    try {
      await simpanKelas(
        {
          id: kelasForm.id,
          nama: kelasForm.nama,
          tingkat: kelasForm.tingkat,
          tahunAjaranId: tahunAjaranAktif.id,
        },
        actor
      );
      setKelasForm({ nama: '', tingkat: '10' });
      setNotice('Data kelas berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan kelas.');
    }
  };

  const handleDeleteKelas = async (k: Kelas) => {
    setErrorMsg(null);
    try {
      await hapusKelas(k, actor);
      setNotice(`Kelas ${k.nama} dihapus.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus kelas.');
    }
  };

  const handleSaveTarif = async (k: Kelas) => {
    if (!tahunAjaranAktif) return;
    setErrorMsg(null);
    setNotice(null);
    const existing = tarifList.find(
      (t) => t.kelasId === k.id && t.tahunAjaranId === tahunAjaranAktif.id
    );
    const nominal = Number(tarifDrafts[k.id] ?? existing?.nominal ?? 0);
    try {
      await simpanTarifSpp(
        { kelasId: k.id, tahunAjaranId: tahunAjaranAktif.id, nominal },
        k.nama,
        actor
      );
      setNotice(`Tarif SPP kelas ${k.nama} disimpan.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan tarif.');
    }
  };

  const handleSeedNow = async () => {
    setSeeding(true);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await seedContohData(actor);
      setNotice(
        `Berhasil mengisi ${res.siswaCount} siswa, ${res.tagihanCount} tagihan, dan ${res.pembayaranCount} pembayaran contoh.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menjalankan seeder.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          {[
            { id: 'siswa' as const, label: `Siswa (${siswaList.length})`, show: true },
            { id: 'kelas' as const, label: 'Kelas & Tahun Ajaran', show: true },
            { id: 'tarif' as const, label: 'Tarif SPP', show: true },
          ]
            .filter((t) => t.show)
            .map((t) => (
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

        {canManageMaster && siswaList.length < 50 && (
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedNow()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Database className="w-3.5 h-3.5" />
            {seeding ? 'Mengisi data...' : 'Isi Data Contoh (204 Siswa)'}
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {notice}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: SISWA */}
      {tab === 'siswa' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cari NIS atau nama siswa..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
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
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="all">Semua Status</option>
                <option value="aktif">Aktif</option>
                <option value="lulus">Lulus</option>
                <option value="pindah">Pindah</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </div>

            {canManageMaster && (
              <button
                type="button"
                onClick={openAddSiswa}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Tambah Siswa
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">NIS</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Nama Siswa</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Kelas</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Kontak Orang Tua</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Beasiswa / Diskon</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                  {canManageMaster && (
                    <th className="py-2.5 px-4 text-right font-semibold">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedSiswa.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManageMaster ? 7 : 6}
                      className="py-8 px-4 text-center text-sm text-slate-500"
                    >
                      Tidak ada siswa yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  pagedSiswa.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-700">
                        {s.nis}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{s.nama}</td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {kelasMap.get(s.kelasId) || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        <div className="font-mono">{s.noHpOrtu || '-'}</div>
                        {s.emailOrtu && (
                          <div className="text-[11px] text-teal-800 truncate max-w-[190px]">
                            {s.emailOrtu}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">
                        {s.diskonTipe === 'none' ? (
                          <span className="text-slate-400">—</span>
                        ) : s.diskonTipe === 'persen' ? (
                          <span className="text-teal-800 font-medium">
                            {s.diskonNilai}% · {s.keteranganDiskon || 'Beasiswa'}
                          </span>
                        ) : (
                          <span className="text-teal-800 font-medium font-mono tabular-nums">
                            {formatRupiah(s.diskonNilai)} · {s.keteranganDiskon || 'Potongan'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusSiswaBadge status={s.statusAktif} />
                      </td>
                      {canManageMaster && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditSiswa(s)}
                            title="Ubah siswa"
                            className="p-1.5 text-slate-500 hover:text-teal-700 rounded-md hover:bg-slate-100"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSiswa(s)}
                            title="Hapus siswa"
                            className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-red-50 ml-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span className="tabular-nums">
              Menampilkan {pagedSiswa.length} dari {filteredSiswa.length} siswa
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
      )}

      {/* TAB 2: KELAS & TAHUN AJARAN */}
      {tab === 'kelas' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Tahun Ajaran</h2>
            {canManageMaster && (
              <form onSubmit={(e) => void handleAddTa(e)} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newTaNama}
                  onChange={(e) => setNewTaNama(e.target.value)}
                  placeholder="Contoh: 2026/2027"
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 px-2">
                  <input
                    type="checkbox"
                    checked={newTaAktif}
                    onChange={(e) => setNewTaAktif(e.target.checked)}
                  />
                  Aktifkan
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                >
                  Tambah TA
                </button>
              </form>
            )}
            <div className="divide-y divide-slate-100">
              {tahunAjaranList.map((ta) => (
                <div key={ta.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{ta.nama}</div>
                    <div className="text-xs text-slate-500">
                      {ta.aktif ? 'Tahun ajaran aktif' : 'Arsip'}
                    </div>
                  </div>
                  {canManageMaster && !ta.aktif && (
                    <button
                      type="button"
                      onClick={() => void setTahunAjaranAktif(ta.id, tahunAjaranList, actor)}
                      className="px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 bg-teal-50 rounded-md hover:bg-teal-100"
                    >
                      Aktifkan
                    </button>
                  )}
                  {ta.aktif && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check className="w-3.5 h-3.5" /> Aktif
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              Daftar Kelas ({tahunAjaranAktif?.nama || '-'})
            </h2>
            {canManageMaster && (
              <form onSubmit={(e) => void handleSaveKelas(e)} className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={kelasForm.nama}
                  onChange={(e) => setKelasForm((f) => ({ ...f, nama: e.target.value }))}
                  placeholder="Nama kelas (mis. X IPA 2)"
                  className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
                <select
                  value={kelasForm.tingkat}
                  onChange={(e) =>
                    setKelasForm((f) => ({ ...f, tingkat: e.target.value as TingkatKelas }))
                  }
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="10">Kelas 10 (X)</option>
                  <option value="11">Kelas 11 (XI)</option>
                  <option value="12">Kelas 12 (XII)</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                >
                  {kelasForm.id ? 'Simpan' : 'Tambah'}
                </button>
                {kelasForm.id && (
                  <button
                    type="button"
                    onClick={() => setKelasForm({ nama: '', tingkat: '10' })}
                    className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg"
                  >
                    Batal
                  </button>
                )}
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {kelasList.map((k) => {
                const count = siswaList.filter((s) => s.kelasId === k.id).length;
                return (
                  <div key={k.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{k.nama}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        Tingkat {k.tingkat} · {count} siswa
                      </div>
                    </div>
                    {canManageMaster && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setKelasForm({ id: k.id, nama: k.nama, tingkat: k.tingkat })
                          }
                          className="p-1.5 text-slate-500 hover:text-teal-700 rounded-md hover:bg-slate-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteKelas(k)}
                          className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TARIF SPP */}
      {tab === 'tarif' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Tarif SPP per Kelas (TA {tahunAjaranAktif?.nama || '-'})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tarif ini digunakan secara otomatis saat membuat tagihan bulanan untuk setiap siswa
              aktif.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {kelasList.map((k) => {
              const existing = tarifList.find(
                (t) => t.kelasId === k.id && t.tahunAjaranId === tahunAjaranAktif?.id
              );
              const val = tarifDrafts[k.id] ?? String(existing?.nominal ?? '');
              return (
                <div
                  key={k.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{k.nama}</div>
                    <div className="text-xs text-slate-500">
                      Tarif berlaku saat ini:{' '}
                      <span className="font-mono font-medium text-slate-700 tabular-nums">
                        {existing ? formatRupiah(existing.nominal) : 'Belum ditetapkan'}
                      </span>
                    </div>
                  </div>
                  {canManageMaster && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={5000}
                        value={val}
                        onChange={(e) =>
                          setTarifDrafts((prev) => ({ ...prev, [k.id]: e.target.value }))
                        }
                        placeholder="Nominal Rp"
                        className="w-44 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveTarif(k)}
                        className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                      >
                        Simpan Tarif
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <SiswaFormModal
        open={siswaModalOpen}
        editingSiswa={editingSiswa}
        kelasList={kelasList}
        semuaSiswa={siswaList}
        actor={actor}
        onClose={() => setSiswaModalOpen(false)}
        onSuccess={(msg) => setNotice(msg)}
      />
    </div>
  );
}

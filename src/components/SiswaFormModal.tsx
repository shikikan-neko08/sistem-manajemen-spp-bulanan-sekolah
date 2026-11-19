import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { simpanSiswa } from '../services/masterService.ts';
import type { AuditActor } from '../services/auditService.ts';
import type { DiskonTipe, Kelas, Siswa, StatusSiswa } from '../types/spp.ts';

interface Props {
  open: boolean;
  editingSiswa: Siswa | null;
  kelasList: Kelas[];
  semuaSiswa: Siswa[];
  actor: AuditActor;
  onClose: () => void;
  onSuccess: (message: string, savedId: string) => void;
}

export function SiswaFormModal({
  open,
  editingSiswa,
  kelasList,
  semuaSiswa,
  actor,
  onClose,
  onSuccess,
}: Props) {
  const [nis, setNis] = useState('');
  const [nama, setNama] = useState('');
  const [kelasId, setKelasId] = useState('');
  const [statusAktif, setStatusAktif] = useState<StatusSiswa>('aktif');
  const [noHpOrtu, setNoHpOrtu] = useState('');
  const [diskonTipe, setDiskonTipe] = useState<DiskonTipe>('none');
  const [diskonNilai, setDiskonNilai] = useState('0');
  const [keteranganDiskon, setKeteranganDiskon] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    if (editingSiswa) {
      setNis(editingSiswa.nis);
      setNama(editingSiswa.nama);
      setKelasId(editingSiswa.kelasId);
      setStatusAktif(editingSiswa.statusAktif);
      setNoHpOrtu(editingSiswa.noHpOrtu);
      setDiskonTipe(editingSiswa.diskonTipe);
      setDiskonNilai(String(editingSiswa.diskonNilai));
      setKeteranganDiskon(editingSiswa.keteranganDiskon);
    } else {
      setNis('');
      setNama('');
      setKelasId(kelasList[0]?.id || '');
      setStatusAktif('aktif');
      setNoHpOrtu('');
      setDiskonTipe('none');
      setDiskonNilai('0');
      setKeteranganDiskon('');
    }
  }, [open, editingSiswa, kelasList]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    try {
      const savedId = await simpanSiswa(
        {
          id: editingSiswa?.id,
          nis,
          nama,
          kelasId,
          statusAktif,
          noHpOrtu,
          diskonTipe,
          diskonNilai: Number(diskonNilai) || 0,
          keteranganDiskon,
        },
        semuaSiswa,
        actor
      );
      onSuccess(
        editingSiswa
          ? `Data siswa ${nama.trim()} berhasil diperbarui.`
          : `Siswa baru ${nama.trim()} berhasil ditambahkan.`,
        savedId
      );
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data siswa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-base font-semibold text-slate-900">
            {editingSiswa ? 'Ubah Data Siswa' : 'Tambah Siswa Baru'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        {kelasList.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            Belum ada kelas terdaftar. Tambahkan kelas terlebih dahulu di menu Data Master → Kelas &
            Tahun Ajaran.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">NIS</label>
            <input
              type="text"
              value={nis}
              onChange={(e) => setNis(e.target.value)}
              required
              placeholder="Contoh: 252610205"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Kelas</label>
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
              placeholder="Nama lengkap siswa"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              No. HP Orang Tua
            </label>
            <input
              type="text"
              value={noHpOrtu}
              onChange={(e) => setNoHpOrtu(e.target.value)}
              placeholder="0812..."
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Status Siswa</label>
            <select
              value={statusAktif}
              onChange={(e) => setStatusAktif(e.target.value as StatusSiswa)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="aktif">Aktif</option>
              <option value="lulus">Lulus</option>
              <option value="pindah">Pindah</option>
              <option value="nonaktif">Nonaktif</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Tipe Diskon / Beasiswa
            </label>
            <select
              value={diskonTipe}
              onChange={(e) => setDiskonTipe(e.target.value as DiskonTipe)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="none">Tidak Ada</option>
              <option value="nominal">Potongan Nominal (Rp)</option>
              <option value="persen">Potongan Persen (%)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nilai Diskon</label>
            <input
              type="number"
              min={0}
              max={diskonTipe === 'persen' ? 100 : undefined}
              disabled={diskonTipe === 'none'}
              value={diskonNilai}
              onChange={(e) => setDiskonNilai(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
          </div>
          {diskonTipe !== 'none' && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Keterangan Beasiswa / Diskon
              </label>
              <input
                type="text"
                value={keteranganDiskon}
                onChange={(e) => setKeteranganDiskon(e.target.value)}
                placeholder="Contoh: Beasiswa Prestasi / Keringanan Yatim"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={saving || kelasList.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
          >
            {saving ? 'Menyimpan...' : 'Simpan Siswa'}
          </button>
        </div>
      </form>
    </div>
  );
}

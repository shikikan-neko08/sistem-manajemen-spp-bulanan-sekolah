import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  Check,
  Copy,
  CreditCard,
  FileText,
  KeyRound,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase.ts';
import {
  DEFAULT_PENGATURAN_SISTEM,
  labelPeran,
  MIDTRANS_PAYMENT_CHANNELS,
} from '../lib/format.ts';
import {
  hapusUndanganPeran,
  simpanAksesPengguna,
  simpanPengaturanSekolah,
  simpanPengaturanSistem,
  ubahPeranPengguna,
  undangPenggunaPeran,
} from '../services/masterService.ts';
import {
  getMidtransAdminDiagnostics,
  testMidtransConnection,
  type MidtransAdminDiagnostics,
  type MidtransConnectionTestResult,
} from '../services/midtransClientService.ts';
import type { ActiveRole, AppUser, HakAksesKhusus, PengaturanSistem } from '../types/spp.ts';

type SettingsTab = 'umum' | 'users' | 'midtrans' | 'operasional';
type OverrideChoice = 'default' | 'allow' | 'deny';

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  danger = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? (danger ? 'bg-amber-600' : 'bg-teal-700') : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function boolToOverrideChoice(val: boolean | undefined): OverrideChoice {
  if (val === true) return 'allow';
  if (val === false) return 'deny';
  return 'default';
}

function overrideChoiceToBool(choice: OverrideChoice): boolean | undefined {
  if (choice === 'allow') return true;
  if (choice === 'deny') return false;
  return undefined;
}

export function SettingsPage() {
  const { profile } = useAuth();
  const { sekolah, pengaturanSistem, usersList, roleInvites } = useSppData();

  const [tab, setTab] = useState<SettingsTab>('umum');
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const actor = useMemo(
    () => ({
      uid: profile?.uid || '',
      nama: profile?.nama || '',
      peran: profile?.peran || 'admin',
    }),
    [profile]
  );

  // --- Draft Identitas Sekolah ---
  const [sekNama, setSekNama] = useState(sekolah?.namaSekolah || 'SMA Negeri 1 Nusantara');
  const [sekNpsn, setSekNpsn] = useState(sekolah?.npsn || '');
  const [sekAlamat, setSekAlamat] = useState(sekolah?.alamat || '');
  const [sekKota, setSekKota] = useState(sekolah?.kota || 'Bandung');
  const [sekTelp, setSekTelp] = useState(sekolah?.telepon || '');
  const [sekEmail, setSekEmail] = useState(sekolah?.email || '');
  const [sekKepsek, setSekKepsek] = useState(sekolah?.namaKepalaSekolah || '');
  const [sekNipKepsek, setSekNipKepsek] = useState(sekolah?.nipKepalaSekolah || '');
  const [sekBank, setSekBank] = useState(sekolah?.namaBank || '');
  const [sekNoRek, setSekNoRek] = useState(sekolah?.noRekening || '');
  const [sekAtasNama, setSekAtasNama] = useState(sekolah?.atasNamaRekening || '');
  const [sekPrefixVa, setSekPrefixVa] = useState(sekolah?.prefixVaSiswa || '88102');

  useEffect(() => {
    if (sekolah) {
      setSekNama(sekolah.namaSekolah || 'SMA Negeri 1 Nusantara');
      setSekNpsn(sekolah.npsn || '');
      setSekAlamat(sekolah.alamat || '');
      setSekKota(sekolah.kota || 'Bandung');
      setSekTelp(sekolah.telepon || '');
      setSekEmail(sekolah.email || '');
      setSekKepsek(sekolah.namaKepalaSekolah || '');
      setSekNipKepsek(sekolah.nipKepalaSekolah || '');
      setSekBank(sekolah.namaBank || '');
      setSekNoRek(sekolah.noRekening || '');
      setSekAtasNama(sekolah.atasNamaRekening || '');
      setSekPrefixVa(sekolah.prefixVaSiswa || '88102');
    }
  }, [sekolah]);

  // --- Draft Pengaturan Sistem ---
  const [sysDraft, setSysDraft] = useState<Omit<PengaturanSistem, 'id' | 'updatedAt'>>({
    ...DEFAULT_PENGATURAN_SISTEM,
  });

  useEffect(() => {
    setSysDraft({
      midtransProductionMode: pengaturanSistem.midtransProductionMode,
      midtransAktif: pengaturanSistem.midtransAktif,
      transferManualAktif: pengaturanSistem.transferManualAktif,
      midtransEnabledPayments: [...pengaturanSistem.midtransEnabledPayments],
      midtransOrderPrefix: pengaturanSistem.midtransOrderPrefix,
      midtransExpiryMenit: pengaturanSistem.midtransExpiryMenit,
      portalOrtuAktif: pengaturanSistem.portalOrtuAktif,
      pesanPemeliharaanPortal: pengaturanSistem.pesanPemeliharaanPortal || '',
      petugasBolehBatalkanPembayaran: pengaturanSistem.petugasBolehBatalkanPembayaran,
      petugasBolehGenerateTagihan: pengaturanSistem.petugasBolehGenerateTagihan,
      petugasBolehLihatMaster: pengaturanSistem.petugasBolehLihatMaster,
      kepsekBolehLihatAudit: pengaturanSistem.kepsekBolehLihatAudit,
      ortuBolehCicilan: pengaturanSistem.ortuBolehCicilan,
      autoGenerateTagihan: pengaturanSistem.autoGenerateTagihan,
      tanggalJatuhTempo: pengaturanSistem.tanggalJatuhTempo,
      prefixKwitansi: pengaturanSistem.prefixKwitansi,
      prefixPengajuanOrtu: pengaturanSistem.prefixPengajuanOrtu,
      catatanKakiKwitansi: pengaturanSistem.catatanKakiKwitansi || '',
      tampilkanNipKepsekDiKwitansi: pengaturanSistem.tampilkanNipKepsekDiKwitansi,
      templateWaTunggakan: pengaturanSistem.templateWaTunggakan || '',
    });
  }, [pengaturanSistem]);

  // --- Midtrans Diagnostics & Production Switch Confirm ---
  const [diagnostics, setDiagnostics] = useState<MidtransAdminDiagnostics | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<MidtransConnectionTestResult | null>(null);
  const [confirmProdOpen, setConfirmProdOpen] = useState(false);
  const [togglingMode, setTogglingMode] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    setLoadingDiagnostics(true);
    setDiagError(null);
    try {
      const res = await getMidtransAdminDiagnostics();
      setDiagnostics(res);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Gagal memuat diagnostik Midtrans.');
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    if (tab === 'midtrans') {
      void loadDiagnostics();
    }
  }, [tab]);

  // --- User Management State ---
  const [invEmail, setInvEmail] = useState('');
  const [invNama, setInvNama] = useState('');
  const [invPeran, setInvPeran] = useState<ActiveRole>('petugas');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | ActiveRole | 'pending'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'aktif' | 'nonaktif'>('all');
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editPeran, setEditPeran] = useState<ActiveRole | 'pending'>('petugas');
  const [editAktif, setEditAktif] = useState(true);
  const [editCatatanAkses, setEditCatatanAkses] = useState('');
  const [editMasterOv, setEditMasterOv] = useState<OverrideChoice>('default');
  const [editGenerateOv, setEditGenerateOv] = useState<OverrideChoice>('default');
  const [editCancelOv, setEditCancelOv] = useState<OverrideChoice>('default');
  const [editAuditOv, setEditAuditOv] = useState<OverrideChoice>('default');
  const [savingUserModal, setSavingUserModal] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return usersList
      .filter((u) => {
        if (userRoleFilter !== 'all' && u.peran !== userRoleFilter) return false;
        if (userStatusFilter === 'aktif' && !u.aktif) return false;
        if (userStatusFilter === 'nonaktif' && u.aktif) return false;
        if (
          q &&
          !u.nama.toLowerCase().includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !(u.catatanAkses || '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [usersList, userSearch, userRoleFilter, userStatusFilter]);

  const openEditUserModal = (u: AppUser) => {
    setEditingUser(u);
    setEditNama(u.nama);
    setEditPeran(u.peran);
    setEditAktif(u.aktif);
    setEditCatatanAkses(u.catatanAkses || '');
    setEditMasterOv(boolToOverrideChoice(u.hakAksesKhusus?.bolehLihatMaster));
    setEditGenerateOv(boolToOverrideChoice(u.hakAksesKhusus?.bolehGenerateTagihan));
    setEditCancelOv(boolToOverrideChoice(u.hakAksesKhusus?.bolehBatalkanPembayaran));
    setEditAuditOv(boolToOverrideChoice(u.hakAksesKhusus?.bolehLihatAudit));
  };

  const handleCopyText = (key: string, text: string) => {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  const clearFeedback = () => {
    setNotice(null);
    setErrorMsg(null);
  };

  const saveSystemSettings = async (
    nextDraft: Omit<PengaturanSistem, 'id' | 'updatedAt'>,
    successText: string,
    auditSummary?: string
  ) => {
    setSaving(true);
    clearFeedback();
    try {
      await simpanPengaturanSistem(nextDraft, actor, auditSummary);
      setNotice(successText);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan sistem.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUmum = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    clearFeedback();
    try {
      await simpanPengaturanSekolah(
        {
          namaSekolah: sekNama,
          npsn: sekNpsn,
          alamat: sekAlamat,
          kota: sekKota,
          telepon: sekTelp,
          email: sekEmail,
          namaKepalaSekolah: sekKepsek,
          nipKepalaSekolah: sekNipKepsek,
          namaBank: sekBank,
          noRekening: sekNoRek,
          atasNamaRekening: sekAtasNama,
          prefixVaSiswa: sekPrefixVa,
        },
        actor
      );
      await simpanPengaturanSistem(
        sysDraft,
        actor,
        `Memperbarui pengaturan umum & status portal orang tua (portalOrtuAktif=${sysDraft.portalOrtuAktif})`
      );
      setNotice('Pengaturan sekolah, rekening, dan status portal berhasil disimpan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan umum.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleProductionMode = async (nextProd: boolean) => {
    if (nextProd) {
      setConfirmProdOpen(true);
      return;
    }
    await applyProductionModeChange(false);
  };

  const applyProductionModeChange = async (nextProd: boolean) => {
    setTogglingMode(true);
    clearFeedback();
    setConfirmProdOpen(false);
    const updatedDraft = { ...sysDraft, midtransProductionMode: nextProd };
    setSysDraft(updatedDraft);
    try {
      await simpanPengaturanSistem(
        updatedDraft,
        actor,
        `Mengubah saklar Midtrans ke mode ${nextProd ? 'PRODUCTION (Live)' : 'SANDBOX (Uji Coba)'}`
      );
      setNotice(
        `Saklar Midtrans berhasil diubah ke mode ${
          nextProd ? 'PRODUCTION (Live)' : 'SANDBOX (Uji Coba)'
        }.`
      );
      await loadDiagnostics();
      setTestResult(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah mode Midtrans.');
    } finally {
      setTogglingMode(false);
    }
  };

  const handleTestMidtrans = async () => {
    setTestingConn(true);
    setTestResult(null);
    clearFeedback();
    try {
      const res = await testMidtransConnection();
      setTestResult(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menguji koneksi Midtrans.');
    } finally {
      setTestingConn(false);
    }
  };

  const toggleMidtransChannel = (channelId: string) => {
    setSysDraft((prev) => {
      const exists = prev.midtransEnabledPayments.includes(channelId);
      const nextList = exists
        ? prev.midtransEnabledPayments.filter((c) => c !== channelId)
        : [...prev.midtransEnabledPayments, channelId];
      return { ...prev, midtransEnabledPayments: nextList };
    });
  };

  const handleInviteRole = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    try {
      await undangPenggunaPeran(invEmail, invNama, invPeran, actor);
      setInvEmail('');
      setInvNama('');
      setNotice('Undangan peran pengguna berhasil ditambahkan.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah undangan peran.');
    }
  };

  const handleQuickRoleChange = async (
    target: AppUser,
    peranBaru: ActiveRole | 'pending',
    aktifBaru: boolean
  ) => {
    clearFeedback();
    try {
      await ubahPeranPengguna(target, peranBaru, aktifBaru, actor);
      setNotice(`Akses ${target.email} diperbarui.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah akses pengguna.');
    }
  };

  const handleSaveUserModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUserModal(true);
    clearFeedback();
    try {
      const hakAksesKhusus: HakAksesKhusus = {};
      if (editPeran === 'petugas') {
        const m = overrideChoiceToBool(editMasterOv);
        const g = overrideChoiceToBool(editGenerateOv);
        const c = overrideChoiceToBool(editCancelOv);
        if (typeof m === 'boolean') hakAksesKhusus.bolehLihatMaster = m;
        if (typeof g === 'boolean') hakAksesKhusus.bolehGenerateTagihan = g;
        if (typeof c === 'boolean') hakAksesKhusus.bolehBatalkanPembayaran = c;
      } else if (editPeran === 'kepala_sekolah') {
        const a = overrideChoiceToBool(editAuditOv);
        if (typeof a === 'boolean') hakAksesKhusus.bolehLihatAudit = a;
      }

      await simpanAksesPengguna(
        editingUser,
        {
          nama: editNama,
          peran: editPeran,
          aktif: editAktif,
          catatanAkses: editCatatanAkses,
          hakAksesKhusus,
        },
        actor
      );
      setNotice(`Profil & hak akses ${editingUser.email} berhasil disimpan.`);
      setEditingUser(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan hak akses pengguna.');
    } finally {
      setSavingUserModal(false);
    }
  };

  const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://domain-anda.vercel.app';
  const webhookUrl = `${appOrigin}/api/midtrans/webhook`;

  const previewWaMessage = useMemo(() => {
    const raw =
      sysDraft.templateWaTunggakan ||
      DEFAULT_PENGATURAN_SISTEM.templateWaTunggakan;
    return raw
      .replaceAll('{nama_siswa}', 'Aulia Putri Pratama')
      .replaceAll('{nis}', '20251001')
      .replaceAll('{kelas}', 'X IPA 1')
      .replaceAll('{bulan_menunggak}', 'Oktober 2026, November 2026')
      .replaceAll('{total_tunggakan}', 'Rp 500.000')
      .replaceAll('{nama_sekolah}', sekNama || 'SMA Negeri 1 Nusantara');
  }, [sysDraft.templateWaTunggakan, sekNama]);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pengaturan Sistem &amp; Integrasi
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola profil sekolah, manajemen user &amp; hak akses, mode Production Midtrans, serta
              aturan tagihan dan kwitansi.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold shrink-0 ${
              pengaturanSistem.midtransProductionMode
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-teal-50 border-teal-200 text-teal-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                pengaturanSistem.midtransProductionMode ? 'bg-amber-600' : 'bg-teal-600'
              }`}
            />
            Midtrans: {pengaturanSistem.midtransProductionMode ? 'Mode Production' : 'Mode Sandbox'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'umum', label: 'Sekolah & Umum', icon: Building2 },
              { id: 'users', label: `User & Hak Akses (${usersList.length})`, icon: Users },
              { id: 'midtrans', label: 'Midtrans & Production', icon: CreditCard },
              { id: 'operasional', label: 'Tagihan, Kwitansi & WA', icon: Sliders },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  clearFeedback();
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-medium shrink-0"
          >
            Tutup
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-700 hover:text-red-900 font-medium shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* TAB 1: SEKOLAH & UMUM */}
      {tab === 'umum' && (
        <form onSubmit={(e) => void handleSaveUmum(e)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Identitas Sekolah (Kop Kwitansi &amp; Laporan Resmi)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Informasi ini tampil otomatis di header kwitansi PDF, cetak, dan ekspor laporan.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Sekolah
                  </label>
                  <input
                    type="text"
                    value={sekNama}
                    onChange={(e) => setSekNama(e.target.value)}
                    required
                    minLength={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">NPSN</label>
                  <input
                    type="text"
                    value={sekNpsn}
                    onChange={(e) => setSekNpsn(e.target.value)}
                    placeholder="Contoh: 20219384"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kota</label>
                  <input
                    type="text"
                    value={sekKota}
                    onChange={(e) => setSekKota(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alamat Lengkap
                  </label>
                  <input
                    type="text"
                    value={sekAlamat}
                    onChange={(e) => setSekAlamat(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Telepon</label>
                  <input
                    type="text"
                    value={sekTelp}
                    onChange={(e) => setSekTelp(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Tata Usaha
                  </label>
                  <input
                    type="email"
                    value={sekEmail}
                    onChange={(e) => setSekEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Kepala Sekolah
                  </label>
                  <input
                    type="text"
                    value={sekKepsek}
                    onChange={(e) => setSekKepsek(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    NIP Kepala Sekolah
                  </label>
                  <input
                    type="text"
                    value={sekNipKepsek}
                    onChange={(e) => setSekNipKepsek(e.target.value)}
                    placeholder="Contoh: 19750412 200003 1 004"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              {/* Rekening & Virtual Account */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Rekening Bank &amp; Virtual Account
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tujuan transfer manual &amp; format nomor VA siswa di Portal Orang Tua.
                  </p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Bank
                    </label>
                    <input
                      type="text"
                      value={sekBank}
                      onChange={(e) => setSekBank(e.target.value)}
                      placeholder="Contoh: Bank BRI / BCA"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nomor Rekening
                    </label>
                    <input
                      type="text"
                      value={sekNoRek}
                      onChange={(e) => setSekNoRek(e.target.value)}
                      placeholder="Contoh: 0012-01-004829-50-3"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Atas Nama Rekening
                    </label>
                    <input
                      type="text"
                      value={sekAtasNama}
                      onChange={(e) => setSekAtasNama(e.target.value)}
                      placeholder="Bendahara Komite SMA"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Prefiks Virtual Account Siswa (Angka)
                    </label>
                    <input
                      type="text"
                      value={sekPrefixVa}
                      onChange={(e) =>
                        setSekPrefixVa(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))
                      }
                      placeholder="88102"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Contoh nomor VA siswa: <span className="font-mono">{sekPrefixVa || '88102'}0020251001</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Portal Orang Tua */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Status Portal Orang Tua
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Matikan sementara jika sedang pemeliharaan atau tutup tahun buku.
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={sysDraft.portalOrtuAktif}
                    onChange={(next) => setSysDraft((p) => ({ ...p, portalOrtuAktif: next }))}
                    label="Aktifkan Portal Orang Tua"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Pesan Pemeliharaan (tampil saat portal dinonaktifkan)
                  </label>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={sysDraft.pesanPemeliharaanPortal || ''}
                    onChange={(e) =>
                      setSysDraft((p) => ({ ...p, pesanPemeliharaanPortal: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan Umum'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: MANAJEMEN USER & HAK AKSES */}
      {tab === 'users' && (
        <div className="space-y-6">
          {/* Matriks Kebijakan Hak Akses Peran */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Kebijakan Hak Akses Berdasarkan Peran (Default)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mengatur kewenangan standar tiap peran. Anda juga dapat memberi pengecualian per
                    user pada tabel di bawah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void saveSystemSettings(
                    sysDraft,
                    'Kebijakan hak akses peran berhasil disimpan.',
                    'Memperbarui kebijakan hak akses peran default'
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap self-start sm:self-center"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan Kebijakan'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  key: 'petugasBolehLihatMaster' as const,
                  title: 'Petugas dapat membuka Data Master',
                  desc: 'Mengizinkan Petugas/Bendahara melihat daftar siswa, kelas, dan tarif SPP.',
                },
                {
                  key: 'petugasBolehGenerateTagihan' as const,
                  title: 'Petugas dapat Generate Tagihan Massal',
                  desc: 'Mengizinkan Petugas membuat tagihan SPP bulanan secara otomatis/massal.',
                },
                {
                  key: 'petugasBolehBatalkanPembayaran' as const,
                  title: 'Petugas dapat Membatalkan Pembayaran',
                  desc: 'Jika dimatikan, hanya Admin yang dapat membatalkan transaksi yang sudah sah.',
                },
                {
                  key: 'kepsekBolehLihatAudit' as const,
                  title: 'Kepala Sekolah dapat melihat Log Aktivitas',
                  desc: 'Mengontrol akses menu Log Aktivitas (audit trail) untuk Kepala Sekolah.',
                },
                {
                  key: 'ortuBolehCicilan' as const,
                  title: 'Orang Tua boleh membayar sebagian (Cicilan)',
                  desc: 'Jika dimatikan, Orang Tua wajib melunasi penuh sisa tagihan per bulan yang dipilih.',
                },
              ].map((policy) => (
                <div
                  key={policy.key}
                  className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-900">{policy.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{policy.desc}</div>
                  </div>
                  <ToggleSwitch
                    checked={Boolean(sysDraft[policy.key])}
                    onChange={(next) =>
                      setSysDraft((prev) => ({ ...prev, [policy.key]: next }))
                    }
                    label={policy.title}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Undangan Peran Sebelum Login */}
          <form
            onSubmit={(e) => void handleInviteRole(e)}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-teal-700" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Tetapkan Peran Staf / Orang Tua Sebelum Login
                </h3>
                <p className="text-xs text-slate-500">
                  Pengguna baru dengan email yang diundang akan langsung aktif sesuai perannya saat
                  pertama kali login &amp; verifikasi email.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="Email pengguna / orang tua"
                required
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                value={invNama}
                onChange={(e) => setInvNama(e.target.value)}
                placeholder="Nama lengkap"
                required
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <select
                value={invPeran}
                onChange={(e) => setInvPeran(e.target.value as ActiveRole)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="petugas">Petugas / Bendahara</option>
                <option value="kepala_sekolah">Kepala Sekolah</option>
                <option value="orang_tua">Orang Tua / Wali</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
              >
                Simpan Undangan
              </button>
            </div>

            {roleInvites.length > 0 && (
              <div className="pt-2 divide-y divide-slate-100 border-t border-slate-100">
                {roleInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{inv.nama}</span> ·{' '}
                      <span className="text-slate-600">{inv.email}</span> ·{' '}
                      <span className="font-semibold text-teal-800">{labelPeran(inv.peran)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void hapusUndanganPeran(inv.id, inv.email, actor)}
                      className="text-red-700 hover:underline font-medium"
                    >
                      Hapus Undangan
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>

          {/* Daftar Pengguna Terdaftar */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Pengguna Terdaftar ({filteredUsers.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Ubah peran, aktif/nonaktifkan akun, atau atur pengecualian hak akses khusus per
                  user.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Cari nama / email / catatan..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) =>
                    setUserRoleFilter(e.target.value as 'all' | ActiveRole | 'pending')
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">Semua Peran</option>
                  <option value="admin">Admin</option>
                  <option value="petugas">Petugas</option>
                  <option value="kepala_sekolah">Kepala Sekolah</option>
                  <option value="orang_tua">Orang Tua</option>
                  <option value="pending">Pending</option>
                </select>
                <select
                  value={userStatusFilter}
                  onChange={(e) =>
                    setUserStatusFilter(e.target.value as 'all' | 'aktif' | 'nonaktif')
                  }
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="all">Semua Status</option>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 text-left font-semibold">Pengguna</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Peran</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                    <th className="py-2.5 px-4 text-left font-semibold">Hak Akses Khusus</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-4 text-center text-xs text-slate-500">
                        Tidak ada pengguna yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isRootAdmin = u.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                      const isSelf = u.uid === profile?.uid;
                      const locked = isRootAdmin || isSelf;
                      const overrideCount = Object.values(u.hakAksesKhusus || {}).filter(
                        (v) => typeof v === 'boolean'
                      ).length;

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">
                              {u.nama}{' '}
                              {isSelf && (
                                <span className="text-[11px] font-normal text-teal-700">
                                  (Anda)
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">{u.email}</div>
                            {u.catatanAkses && (
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Catatan: {u.catatanAkses}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <select
                              value={u.peran}
                              disabled={locked}
                              onChange={(e) =>
                                void handleQuickRoleChange(
                                  u,
                                  e.target.value as ActiveRole | 'pending',
                                  u.aktif
                                )
                              }
                              className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-500"
                            >
                              <option value="admin">Admin</option>
                              <option value="petugas">Petugas / Bendahara</option>
                              <option value="kepala_sekolah">Kepala Sekolah</option>
                              <option value="orang_tua">Orang Tua / Wali</option>
                              <option value="pending">Pending</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-4">
                            <button
                              type="button"
                              disabled={locked}
                              onClick={() => void handleQuickRoleChange(u, u.peran, !u.aktif)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border disabled:opacity-60 ${
                                u.aktif
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {u.aktif ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-600">
                            {overrideCount > 0 ? (
                              <span className="font-medium text-teal-800">
                                {overrideCount} pengecualian aktif
                              </span>
                            ) : (
                              <span className="text-slate-400">Ikuti kebijakan peran</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditUserModal(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
                            >
                              <UserCog className="w-3.5 h-3.5" />
                              Atur Akses
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: API PAYMENT GATEWAY (MIDTRANS) & SAKLAR MODE PRODUCTION */}
      {tab === 'midtrans' && (
        <div className="space-y-6">
          {/* Saklar Utama Mode Production */}
          <div
            className={`border rounded-xl p-5 space-y-4 ${
              sysDraft.midtransProductionMode
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                    sysDraft.midtransProductionMode
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-teal-50 border-teal-200 text-teal-700'
                  }`}
                >
                  {sysDraft.midtransProductionMode ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Saklar Mode Production Midtrans
                    </h3>
                    <span
                      className={`text-xs font-semibold ${
                        sysDraft.midtransProductionMode ? 'text-amber-800' : 'text-teal-800'
                      }`}
                    >
                      ({sysDraft.midtransProductionMode ? 'PRODUCTION / LIVE' : 'SANDBOX / UJI COBA'})
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    {sysDraft.midtransProductionMode
                      ? 'Mode Production aktif. Semua transaksi Midtrans Snap di Portal Orang Tua memproses pembayaran uang asli menggunakan endpoint Live Midtrans.'
                      : 'Mode Sandbox aktif. Cocok untuk simulasi dan pengujian pembayaran tanpa memotong saldo atau rekening asli.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-medium text-slate-700">
                  {sysDraft.midtransProductionMode ? 'Live Production' : 'Sandbox'}
                </span>
                <ToggleSwitch
                  checked={sysDraft.midtransProductionMode}
                  disabled={togglingMode}
                  danger
                  onChange={(next) => void handleToggleProductionMode(next)}
                  label="Saklar Mode Production Midtrans"
                />
              </div>
            </div>

            {confirmProdOpen && (
              <div className="p-4 bg-white border border-amber-300 rounded-lg space-y-3">
                <div className="flex items-start gap-2 text-xs text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold">
                      Konfirmasi Aktivasi Mode Production Midtrans
                    </div>
                    <p className="text-slate-600 leading-relaxed">
                      Pastikan environment variables server (
                      <span className="font-mono font-semibold">MIDTRANS_PRODUCTION_SERVER_KEY</span>{' '}
                      &amp;{' '}
                      <span className="font-mono font-semibold">MIDTRANS_PRODUCTION_CLIENT_KEY</span>
                      , atau <span className="font-mono font-semibold">MIDTRANS_SERVER_KEY</span>{' '}
                      tanpa prefiks <span className="font-mono">SB-</span>) sudah terpasang dengan
                      benar. Setelah aktif, seluruh pembayaran orang tua akan menggunakan transaksi
                      asli.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmProdOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    Batal (Tetap Sandbox)
                  </button>
                  <button
                    type="button"
                    disabled={togglingMode}
                    onClick={() => void applyProductionModeChange(true)}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-md"
                  >
                    Ya, Aktifkan Mode Production
                  </button>
                </div>
              </div>
            )}

            {diagnostics?.keyModeMismatch && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-700" />
                <span>
                  Peringatan ketidakcocokan kunci: Mode saat ini adalah{' '}
                  <strong>{diagnostics.isProduction ? 'Production' : 'Sandbox'}</strong>, tetapi
                  kunci yang terbaca pada server memiliki prefiks yang tidak sesuai (kunci Sandbox
                  selalu diawali <span className="font-mono">SB-Mid-</span>). Periksa kembali
                  Secrets/Env Vars server Anda.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Kiri: Konfigurasi Kanal & Parameter Transaksi Midtrans */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Konfigurasi Pembayaran Portal &amp; Kanal Midtrans
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Atur metode yang tersedia di Portal Orang Tua serta parameter transaksi Snap API.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Aktifkan Midtrans Snap
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Pembayaran instan QRIS / VA / E-Wallet
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={sysDraft.midtransAktif}
                    onChange={(next) => setSysDraft((p) => ({ ...p, midtransAktif: next }))}
                    label="Aktifkan Midtrans Snap"
                  />
                </div>

                <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      Aktifkan Transfer Manual
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Transfer rekening sekolah &amp; konfirmasi
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={sysDraft.transferManualAktif}
                    onChange={(next) => setSysDraft((p) => ({ ...p, transferManualAktif: next }))}
                    label="Aktifkan Transfer Manual"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prefiks Order ID Midtrans
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={sysDraft.midtransOrderPrefix}
                    onChange={(e) =>
                      setSysDraft((p) => ({
                        ...p,
                        midtransOrderPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Contoh: <span className="font-mono">{sysDraft.midtransOrderPrefix || 'SPP'}-20251001-...</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Masa Berlaku Transaksi (Menit)
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={10080}
                    value={sysDraft.midtransExpiryMenit}
                    onChange={(e) =>
                      setSysDraft((p) => ({
                        ...p,
                        midtransExpiryMenit: Number(e.target.value) || 1440,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {[
                      { label: '1 Jam', val: 60 },
                      { label: '6 Jam', val: 360 },
                      { label: '24 Jam', val: 1440 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() =>
                          setSysDraft((p) => ({ ...p, midtransExpiryMenit: preset.val }))
                        }
                        className="px-2 py-0.5 text-[11px] border border-slate-300 rounded-md hover:bg-slate-50 text-slate-600"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800">
                    Kanal Pembayaran Midtrans yang Diaktifkan
                  </label>
                  <span className="text-[11px] text-slate-500">
                    {sysDraft.midtransEnabledPayments.length} kanal dipilih
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MIDTRANS_PAYMENT_CHANNELS.map((ch) => {
                    const checked = sysDraft.midtransEnabledPayments.includes(ch.id);
                    return (
                      <label
                        key={ch.id}
                        className={`flex items-center gap-2.5 p-2.5 border rounded-lg cursor-pointer text-xs ${
                          checked ? 'border-teal-600 bg-teal-50/40' : 'border-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMidtransChannel(ch.id)}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{ch.label}</div>
                          <div className="text-[11px] text-slate-500">
                            {ch.group} · <span className="font-mono">{ch.id}</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  Jika semua kotak tidak dicentang, Midtrans akan menampilkan seluruh kanal yang
                  aktif pada akun Midtrans Anda.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void saveSystemSettings(
                      sysDraft,
                      'Konfigurasi kanal & transaksi Midtrans berhasil disimpan.',
                      `Memperbarui konfigurasi kanal Midtrans (${sysDraft.midtransEnabledPayments.length} kanal, expiry ${sysDraft.midtransExpiryMenit}m)`
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan Pengaturan Midtrans'}
                </button>
              </div>
            </div>

            {/* Kanan: Diagnostik Kunci Server & Endpoint Callback */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-teal-700" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      Status Kredensial API Server
                    </h3>
                  </div>
                  <button
                    type="button"
                    disabled={loadingDiagnostics}
                    onClick={() => void loadDiagnostics()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingDiagnostics ? 'animate-spin' : ''}`} />
                    Muat Ulang
                  </button>
                </div>

                {diagError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
                    {diagError}
                  </div>
                )}

                {diagnostics ? (
                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Kunci Mode Aktif</span>
                        <span
                          className={`font-semibold ${
                            diagnostics.activeConfigured ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {diagnostics.activeConfigured ? 'Terpasang di Server' : 'Belum Terpasang'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Client Key Aktif</span>
                        <span className="font-mono text-slate-800">
                          {diagnostics.clientKeyMasked || '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Kunci Sandbox</span>
                        <span className="font-mono text-slate-700">
                          {diagnostics.sandboxConfigured
                            ? diagnostics.sandboxClientKeyMasked
                            : 'Belum diisi'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Kunci Production</span>
                        <span className="font-mono text-slate-700">
                          {diagnostics.productionConfigured
                            ? diagnostics.productionClientKeyMasked
                            : 'Belum diisi'}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 space-y-1">
                      <div>
                        Endpoint Snap:{' '}
                        <span className="font-mono text-slate-700 break-all">
                          {diagnostics.snapBaseUrl}
                        </span>
                      </div>
                      <div>
                        Skrip Snap.js:{' '}
                        <span className="font-mono text-slate-700 break-all">
                          {diagnostics.snapScriptUrl}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={testingConn}
                      onClick={() => void handleTestMidtrans()}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-lg"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      {testingConn ? 'Menguji Koneksi ke Midtrans...' : 'Uji Koneksi API Midtrans'}
                    </button>

                    {testResult && (
                      <div
                        className={`p-3 rounded-lg border text-xs ${
                          testResult.ok
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        <div className="font-semibold">
                          {testResult.ok ? 'Koneksi Berhasil' : 'Koneksi Gagal'} (HTTP{' '}
                          {testResult.statusCode})
                        </div>
                        <p className="mt-0.5 leading-relaxed">{testResult.message}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-500">
                    {loadingDiagnostics ? 'Memeriksa kredensial server...' : 'Belum ada data diagnostik.'}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-600 space-y-1.5">
                  <div className="font-semibold text-slate-800">
                    Keamanan Kunci API (Server-Only Secrets)
                  </div>
                  <p className="leading-relaxed">
                    Demi keamanan, <span className="font-mono">Server Key</span> Midtrans tidak
                    pernah disimpan di database browser. Atur variabel berikut pada panel{' '}
                    <strong>Secrets AI Studio</strong> atau <strong>Vercel Environment Variables</strong>:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 font-mono text-[10px] text-slate-700">
                    <li>MIDTRANS_SERVER_KEY &amp; MIDTRANS_CLIENT_KEY</li>
                    <li>MIDTRANS_SANDBOX_SERVER_KEY &amp; MIDTRANS_SANDBOX_CLIENT_KEY (opsional)</li>
                    <li>MIDTRANS_PRODUCTION_SERVER_KEY &amp; MIDTRANS_PRODUCTION_CLIENT_KEY (opsional)</li>
                  </ul>
                </div>
              </div>

              {/* URL Webhook & Redirect */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  URL Webhook &amp; Redirect Midtrans
                </h3>
                <p className="text-xs text-slate-500">
                  Salin URL berikut ke Midtrans Dashboard → Settings → Payment / Configuration.
                </p>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <div className="text-[11px] font-medium text-slate-600 mb-1">
                      Payment Notification URL (Webhook)
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-800 truncate">
                        {webhookUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyText('webhook', webhookUrl)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-slate-300 rounded-md hover:bg-slate-50 shrink-0"
                      >
                        {copiedKey === 'webhook' ? (
                          <Check className="w-3 h-3 text-emerald-700" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedKey === 'webhook' ? 'Tersalin' : 'Salin'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-medium text-slate-600 mb-1">
                      Finish / Unfinish / Error Redirect URL
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-mono text-[11px] text-slate-800 truncate">
                        {appOrigin}/
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyText('finish', `${appOrigin}/`)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-slate-300 rounded-md hover:bg-slate-50 shrink-0"
                      >
                        {copiedKey === 'finish' ? (
                          <Check className="w-3 h-3 text-emerald-700" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedKey === 'finish' ? 'Tersalin' : 'Salin'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TAGIHAN, KWITANSI & NOTIFIKASI WA */}
      {tab === 'operasional' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Aturan Tagihan & Penomoran */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-700" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Penagihan Bulanan &amp; Format Kwitansi
                </h3>
              </div>

              <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Generate Tagihan Otomatis Awal Bulan
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Buat tagihan bulan berjalan secara otomatis saat Admin atau Petugas membuka
                    aplikasi.
                  </div>
                </div>
                <ToggleSwitch
                  checked={sysDraft.autoGenerateTagihan}
                  onChange={(next) => setSysDraft((p) => ({ ...p, autoGenerateTagihan: next }))}
                  label="Generate Tagihan Otomatis"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Jatuh Tempo (1–28)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={sysDraft.tanggalJatuhTempo}
                    onChange={(e) =>
                      setSysDraft((p) => ({
                        ...p,
                        tanggalJatuhTempo: Math.min(28, Math.max(1, Number(e.target.value) || 10)),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prefiks No. Kwitansi
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={sysDraft.prefixKwitansi}
                    onChange={(e) =>
                      setSysDraft((p) => ({
                        ...p,
                        prefixKwitansi: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prefiks Ajuan Portal
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={sysDraft.prefixPengajuanOrtu}
                    onChange={(e) =>
                      setSysDraft((p) => ({
                        ...p,
                        prefixPengajuanOrtu: e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9_-]/g, ''),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Kaki Kwitansi Resmi
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={sysDraft.catatanKakiKwitansi || ''}
                  onChange={(e) =>
                    setSysDraft((p) => ({ ...p, catatanKakiKwitansi: e.target.value }))
                  }
                  placeholder="Contoh: Simpan kwitansi ini sebagai bukti pembayaran SPP yang sah."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Tampilkan Nama &amp; NIP Kepala Sekolah di Kwitansi
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Menambahkan blok mengetahui Kepala Sekolah pada cetakan dan PDF kwitansi.
                  </div>
                </div>
                <ToggleSwitch
                  checked={sysDraft.tampilkanNipKepsekDiKwitansi}
                  onChange={(next) =>
                    setSysDraft((p) => ({ ...p, tampilkanNipKepsekDiKwitansi: next }))
                  }
                  label="Tampilkan NIP Kepala Sekolah di Kwitansi"
                />
              </div>
            </div>

            {/* Template WhatsApp Pengingat Tunggakan */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-700" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Template Pesan WhatsApp Pengingat Tunggakan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Digunakan pada tombol kirim pengingat WhatsApp di halaman Daftar Tunggakan.
                  </p>
                </div>
              </div>

              <div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    '{nama_siswa}',
                    '{nis}',
                    '{kelas}',
                    '{bulan_menunggak}',
                    '{total_tunggakan}',
                    '{nama_sekolah}',
                  ].map((ph) => (
                    <button
                      key={ph}
                      type="button"
                      onClick={() =>
                        setSysDraft((p) => ({
                          ...p,
                          templateWaTunggakan: `${p.templateWaTunggakan || ''} ${ph}`.trim(),
                        }))
                      }
                      className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
                    >
                      + {ph}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={5}
                  maxLength={600}
                  value={sysDraft.templateWaTunggakan || ''}
                  onChange={(e) =>
                    setSysDraft((p) => ({ ...p, templateWaTunggakan: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-[11px] font-semibold text-slate-700">
                  Pratinjau Pesan Contoh:
                </div>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {previewWaMessage}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void saveSystemSettings(
                  sysDraft,
                  'Pengaturan operasional tagihan, kwitansi, dan template WA berhasil disimpan.',
                  'Memperbarui pengaturan operasional tagihan, kwitansi & template WhatsApp'
                )
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan Operasional'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL PENGATURAN HAK AKSES KHUSUS PER USER */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={(e) => void handleSaveUserModal(e)}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Atur Profil &amp; Hak Akses Pengguna
                </h3>
                <p className="text-xs text-slate-500">{editingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  required
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran</label>
                  <select
                    value={editPeran}
                    disabled={
                      editingUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL ||
                      editingUser.uid === profile?.uid
                    }
                    onChange={(e) => setEditPeran(e.target.value as ActiveRole | 'pending')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    <option value="admin">Admin</option>
                    <option value="petugas">Petugas / Bendahara</option>
                    <option value="kepala_sekolah">Kepala Sekolah</option>
                    <option value="orang_tua">Orang Tua / Wali</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Akun
                  </label>
                  <select
                    value={editAktif ? 'aktif' : 'nonaktif'}
                    disabled={
                      editingUser.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL ||
                      editingUser.uid === profile?.uid
                    }
                    onChange={(e) => setEditAktif(e.target.value === 'aktif')}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Akses / Jabatan (Opsional)
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={editCatatanAkses}
                  onChange={(e) => setEditCatatanAkses(e.target.value)}
                  placeholder="Contoh: Bendahara Penerimaan SPP"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {editPeran === 'petugas' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="text-xs font-semibold text-slate-800">
                    Pengecualian Hak Akses Khusus Petugas
                  </div>
                  {(
                    [
                      {
                        label: 'Lihat Data Master',
                        value: editMasterOv,
                        setter: setEditMasterOv,
                        defaultVal: sysDraft.petugasBolehLihatMaster,
                      },
                      {
                        label: 'Generate Tagihan Massal',
                        value: editGenerateOv,
                        setter: setEditGenerateOv,
                        defaultVal: sysDraft.petugasBolehGenerateTagihan,
                      },
                      {
                        label: 'Batalkan Pembayaran',
                        value: editCancelOv,
                        setter: setEditCancelOv,
                        defaultVal: sysDraft.petugasBolehBatalkanPembayaran,
                      },
                    ] as const
                  ).map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-700">{row.label}</span>
                      <select
                        value={row.value}
                        onChange={(e) => row.setter(e.target.value as OverrideChoice)}
                        className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                      >
                        <option value="default">
                          Ikuti Kebijakan ({row.defaultVal ? 'Izinkan' : 'Larang'})
                        </option>
                        <option value="allow">Selalu Izinkan</option>
                        <option value="deny">Selalu Larang</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {editPeran === 'kepala_sekolah' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800">
                    Pengecualian Hak Akses Kepala Sekolah
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-700">Akses Log Aktivitas</span>
                    <select
                      value={editAuditOv}
                      onChange={(e) => setEditAuditOv(e.target.value as OverrideChoice)}
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded-md bg-white"
                    >
                      <option value="default">
                        Ikuti Kebijakan ({sysDraft.kepsekBolehLihatAudit ? 'Izinkan' : 'Larang'})
                      </option>
                      <option value="allow">Selalu Izinkan</option>
                      <option value="deny">Selalu Larang</option>
                    </select>
                  </div>
                </div>
              )}

              {editPeran === 'admin' && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
                  Peran Admin selalu memiliki akses penuh ke seluruh fitur, data master, transaksi,
                  log aktivitas, dan halaman pengaturan sistem.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-sm text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingUserModal}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
              >
                {savingUserModal ? 'Menyimpan...' : 'Simpan Akses'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

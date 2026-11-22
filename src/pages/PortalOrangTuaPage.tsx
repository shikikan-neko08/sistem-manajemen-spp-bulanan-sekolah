import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  CreditCard,
  ExternalLink,
  Receipt,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { KwitansiPrintModal } from '../components/KwitansiPrintModal.tsx';
import {
  StatusPembayaranBadge,
  StatusPembayaranOrtuBadge,
  StatusSiswaBadge,
  StatusTagihanBadge,
} from '../components/StatusBadge.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import {
  formatRupiah,
  formatTanggalSingkat,
  labelKanalOrtu,
  labelMidtransStatus,
  namaBulan,
  todayIsoDate,
  virtualAccountSiswa,
} from '../lib/format.ts';
import {
  checkMidtransOrderStatus,
  createMidtransOrder,
  getMidtransConfig,
  isMidtransSettled,
  loadMidtransSnapScript,
  type MidtransPublicConfig,
} from '../services/midtransClientService.ts';
import {
  kirimPembayaranOrtu,
  simpanPengajuanMidtransOrtu,
  sinkronStatusMidtransOrtu,
} from '../services/pembayaranService.ts';
import type {
  KanalPembayaranOrtu,
  Pembayaran,
  PembayaranDetail,
  PembayaranOrtu,
  TagihanSpp,
} from '../types/spp.ts';

export function PortalOrangTuaPage() {
  const { profile, previewRole } = useAuth();
  const {
    sekolah,
    tahunAjaranAktif,
    kelasList,
    siswaList,
    tagihanList,
    pembayaranList,
    pembayaranOrtuList,
    loadingData,
  } = useSppData();

  const isAdminPreview = profile?.peran === 'admin' && previewRole === 'orang_tua';

  const accessibleSiswa = useMemo(() => {
    if (isAdminPreview) {
      return siswaList;
    }
    const email = (profile?.email || '').trim().toLowerCase();
    return siswaList.filter((s) => (s.emailOrtu || '').trim().toLowerCase() === email);
  }, [isAdminPreview, siswaList, profile?.email]);

  const [selectedSiswaId, setSelectedSiswaId] = useState<string>('');
  const [selectedTagihanMap, setSelectedTagihanMap] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<'midtrans' | 'manual'>('midtrans');
  const [kanal, setKanal] = useState<Exclude<KanalPembayaranOrtu, 'midtrans'>>('transfer_bank');
  const [tanggalTransfer, setTanggalTransfer] = useState(todayIsoDate());
  const [namaPengirim, setNamaPengirim] = useState(profile?.nama || '');
  const [referensiTransfer, setReferensiTransfer] = useState('');
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Midtrans client config & status sync
  const [midtransConfig, setMidtransConfig] = useState<MidtransPublicConfig | null>(null);
  const [loadingMidtransConfig, setLoadingMidtransConfig] = useState(true);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
  const [fallbackSnapUrl, setFallbackSnapUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMidtransConfig()
      .then((cfg) => {
        if (active) setMidtransConfig(cfg);
      })
      .catch(() => {
        if (active) {
          setMidtransConfig({
            configured: false,
            isProduction: false,
            clientKey: '',
            snapScriptUrl: 'https://app.sandbox.midtrans.com/snap/snap.js',
          });
        }
      })
      .finally(() => {
        if (active) setLoadingMidtransConfig(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const [activeKwitansi, setActiveKwitansi] = useState<{
    pembayaran: Pembayaran;
    details?: PembayaranDetail[];
  } | null>(null);

  useEffect(() => {
    if (accessibleSiswa.length > 0 && !accessibleSiswa.some((s) => s.id === selectedSiswaId)) {
      setSelectedSiswaId(accessibleSiswa[0].id);
      setSelectedTagihanMap({});
    }
  }, [accessibleSiswa, selectedSiswaId]);

  useEffect(() => {
    if (!namaPengirim && profile?.nama) {
      setNamaPengirim(profile.nama);
    }
  }, [profile?.nama, namaPengirim]);

  const kelasMap = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);
  const selectedSiswa = accessibleSiswa.find((s) => s.id === selectedSiswaId) || null;

  const siswaTagihan = useMemo(() => {
    if (!selectedSiswa) return [];
    return tagihanList
      .filter((t) => t.siswaId === selectedSiswa.id)
      .sort((a, b) => b.tahun * 100 + b.bulan - (a.tahun * 100 + a.bulan));
  }, [tagihanList, selectedSiswa]);

  const unpaidTagihan = useMemo(() => {
    return siswaTagihan
      .filter((t) => t.status !== 'lunas' && t.sisaTagihan > 0)
      .sort((a, b) => a.tahun * 100 + a.bulan - (b.tahun * 100 + b.bulan));
  }, [siswaTagihan]);

  const siswaPembayaranSah = useMemo(() => {
    if (!selectedSiswa) return [];
    return pembayaranList.filter((p) => p.siswaId === selectedSiswa.id);
  }, [pembayaranList, selectedSiswa]);

  const siswaPengajuanOrtu = useMemo(() => {
    if (!selectedSiswa) return [];
    return pembayaranOrtuList.filter((po) => po.siswaId === selectedSiswa.id);
  }, [pembayaranOrtuList, selectedSiswa]);

  // Peta nominal yang sedang menunggu verifikasi per tagihanId
  const pendingByTagihan = useMemo(() => {
    const map = new Map<string, number>();
    for (const po of siswaPengajuanOrtu) {
      if (po.status !== 'menunggu_verifikasi') continue;
      for (const item of po.items) {
        map.set(item.tagihanId, (map.get(item.tagihanId) || 0) + item.bayarNominal);
      }
    }
    return map;
  }, [siswaPengajuanOrtu]);

  const summary = useMemo(() => {
    const now = new Date();
    const curBulan = now.getMonth() + 1;
    const curTahun = now.getFullYear();

    let totalTunggakan = 0;
    let totalTerbayar = 0;
    let tagihanBulanIni = 0;
    for (const t of siswaTagihan) {
      totalTunggakan += t.sisaTagihan;
      totalTerbayar += t.totalTerbayar;
      if (t.bulan === curBulan && t.tahun === curTahun) {
        tagihanBulanIni += t.sisaTagihan;
      }
    }
    const pendingVerifikasi = siswaPengajuanOrtu
      .filter((po) => po.status === 'menunggu_verifikasi')
      .reduce((acc, po) => acc + po.totalBayar, 0);

    return { totalTunggakan, totalTerbayar, tagihanBulanIni, pendingVerifikasi };
  }, [siswaTagihan, siswaPengajuanOrtu]);

  const toggleTagihan = (t: TagihanSpp) => {
    setSelectedTagihanMap((prev) => {
      const next = { ...prev };
      if (next[t.id] !== undefined) {
        delete next[t.id];
      } else {
        const alreadyPending = pendingByTagihan.get(t.id) || 0;
        const suggested = Math.max(0, t.sisaTagihan - alreadyPending);
        next[t.id] = suggested > 0 ? suggested : t.sisaTagihan;
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

  const totalAkanDibayar = useMemo(
    () => Object.values(selectedTagihanMap).reduce((acc, v) => acc + (v || 0), 0),
    [selectedTagihanMap]
  );

  const handleCopy = (label: string, value: string) => {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value);
    setCopiedField(label);
    window.setTimeout(() => setCopiedField(null), 1800);
  };

  const refreshMidtransOrderInFirestore = async (
    pengajuanId: string,
    orderId: string,
    silentSuccess = false
  ) => {
    try {
      const status = await checkMidtransOrderStatus(orderId);
      await sinkronStatusMidtransOrtu({
        pengajuanId,
        transactionStatus: status.transactionStatus,
        paymentType: status.paymentType,
      });
      if (!silentSuccess) {
        if (isMidtransSettled(status.transactionStatus, status.fraudStatus)) {
          setSuccessMsg(
            `Pembayaran Midtrans ${orderId} sudah LUNAS (${status.paymentType || 'Midtrans'}). Bendahara akan menerbitkan kwitansi resmi.`
          );
        } else {
          setSuccessMsg(
            `Status transaksi ${orderId}: ${labelMidtransStatus(status.transactionStatus)}.`
          );
        }
      }
    } catch (err) {
      if (!silentSuccess) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal memeriksa status pembayaran Midtrans.'
        );
      }
    }
  };

  const handlePayWithMidtrans = async () => {
    if (!profile || !selectedSiswa) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setFallbackSnapUrl(null);

    if (!midtransConfig?.configured) {
      setErrorMsg('Gateway Midtrans belum dikonfigurasi pada server.');
      return;
    }

    const items = unpaidTagihan
      .filter((t) => (selectedTagihanMap[t.id] || 0) > 0)
      .map((t) => ({ tagihan: t, bayarNominal: selectedTagihanMap[t.id] }));

    if (items.length === 0) {
      setErrorMsg('Pilih minimal satu bulan tagihan dengan nominal lebih dari Rp 0.');
      return;
    }

    setSubmitting(true);
    try {
      const kelasNama = kelasMap.get(selectedSiswa.kelasId) || '-';
      const order = await createMidtransOrder({
        siswaId: selectedSiswa.id,
        siswaNis: selectedSiswa.nis,
        siswaNama: selectedSiswa.nama,
        kelasNama,
        customerName: profile.nama || selectedSiswa.nama,
        customerEmail: selectedSiswa.emailOrtu || profile.email,
        customerPhone: selectedSiswa.noHpOrtu,
        items: items.map((i) => ({
          tagihanId: i.tagihan.id,
          bulan: i.tagihan.bulan,
          tahun: i.tagihan.tahun,
          bayarNominal: i.bayarNominal,
        })),
      });

      const created = await simpanPengajuanMidtransOrtu({
        siswa: selectedSiswa,
        kelasNama,
        items,
        orderId: order.orderId,
        snapToken: order.snapToken,
        redirectUrl: order.redirectUrl,
        actor: {
          uid: profile.uid,
          nama: profile.nama,
          peran: isAdminPreview ? 'orang_tua' : profile.peran,
          email: profile.email,
        },
      });

      setSelectedTagihanMap({});
      if (order.redirectUrl) {
        setFallbackSnapUrl(order.redirectUrl);
      }

      const snap = await loadMidtransSnapScript(
        midtransConfig.snapScriptUrl,
        midtransConfig.clientKey
      );

      setSubmitting(false);
      snap.pay(order.snapToken, {
        onSuccess: () => {
          void refreshMidtransOrderInFirestore(created.id, order.orderId);
        },
        onPending: () => {
          void refreshMidtransOrderInFirestore(created.id, order.orderId);
        },
        onError: () => {
          setErrorMsg(
            `Pembayaran Midtrans untuk order ${order.orderId} gagal diproses. Anda dapat mencoba ulang melalui tabel riwayat di bawah.`
          );
        },
        onClose: () => {
          void refreshMidtransOrderInFirestore(created.id, order.orderId, true);
          setSuccessMsg(
            `Order Midtrans ${order.orderId} tersimpan. Jika pembayaran belum selesai, Anda dapat melanjutkannya kapan saja melalui daftar riwayat.`
          );
        },
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memulai pembayaran Midtrans.');
      setSubmitting(false);
    }
  };

  const handleResumeSnap = async (po: PembayaranOrtu) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!po.midtransSnapToken || !midtransConfig?.configured) {
      setErrorMsg('Token Midtrans Snap tidak tersedia atau konfigurasi server belum aktif.');
      return;
    }
    try {
      const snap = await loadMidtransSnapScript(
        midtransConfig.snapScriptUrl,
        midtransConfig.clientKey
      );
      const orderId = po.midtransOrderId || po.kodePengajuan;
      snap.pay(po.midtransSnapToken, {
        onSuccess: () => {
          void refreshMidtransOrderInFirestore(po.id, orderId);
        },
        onPending: () => {
          void refreshMidtransOrderInFirestore(po.id, orderId);
        },
        onError: () => {
          setErrorMsg(`Transaksi ${orderId} gagal atau dibatalkan di Midtrans.`);
        },
        onClose: () => {
          void refreshMidtransOrderInFirestore(po.id, orderId, true);
        },
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuka Midtrans Snap.');
    }
  };

  const handleCheckStatusRow = async (po: PembayaranOrtu) => {
    const orderId = po.midtransOrderId || po.kodePengajuan;
    setCheckingOrderId(po.id);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await refreshMidtransOrderInFirestore(po.id, orderId);
    } finally {
      setCheckingOrderId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMode === 'midtrans') {
      await handlePayWithMidtrans();
      return;
    }
    if (!profile || !selectedSiswa) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const items = unpaidTagihan
      .filter((t) => (selectedTagihanMap[t.id] || 0) > 0)
      .map((t) => ({ tagihan: t, bayarNominal: selectedTagihanMap[t.id] }));

    if (items.length === 0) {
      setErrorMsg('Pilih minimal satu bulan tagihan dengan nominal lebih dari Rp 0.');
      return;
    }

    setSubmitting(true);
    try {
      const kelasNama = kelasMap.get(selectedSiswa.kelasId) || '-';
      const created = await kirimPembayaranOrtu({
        siswa: selectedSiswa,
        kelasNama,
        items,
        kanal,
        tanggalTransfer,
        namaPengirim,
        referensiTransfer,
        catatan,
        actor: {
          uid: profile.uid,
          nama: profile.nama,
          peran: isAdminPreview ? 'orang_tua' : profile.peran,
          email: profile.email,
        },
      });
      setSelectedTagihanMap({});
      setReferensiTransfer('');
      setCatatan('');
      setSuccessMsg(
        `Konfirmasi pembayaran ${created.kodePengajuan} sebesar ${formatRupiah(
          created.totalBayar
        )} berhasil dikirim. Bendahara akan memverifikasi mutasi dan menerbitkan kwitansi resmi.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim konfirmasi pembayaran.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        Memuat data tagihan siswa...
      </div>
    );
  }

  if (accessibleSiswa.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Belum Ada Data Siswa Tertaut
            </h2>
            <p className="text-xs text-slate-500">{profile?.email}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          Akun Orang Tua / Wali Anda sudah aktif, namun belum ada data siswa yang ditautkan ke
          alamat email <span className="font-medium text-slate-900">{profile?.email}</span>.
          Silakan hubungi Admin / Tata Usaha{' '}
          <span className="font-medium text-slate-900">
            {sekolah?.namaSekolah || 'sekolah'}
          </span>{' '}
          agar email Anda dicantumkan pada data siswa.
        </p>
      </div>
    );
  }

  const vaNumber = selectedSiswa ? virtualAccountSiswa(selectedSiswa.nis) : '';
  const namaBank = sekolah?.namaBank || 'Bank BRI / BCA (Hubungi Tata Usaha)';
  const noRekening = sekolah?.noRekening || '';
  const atasNama = sekolah?.atasNamaRekening || sekolah?.namaSekolah || 'Bendahara Sekolah';

  return (
    <div className="space-y-6">
      {isAdminPreview && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-teal-800">
              Mode Pratinjau Portal Orang Tua (Admin)
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Pilih siswa di sebelah kanan untuk melihat tampilan tagihan dan mencoba alur
              pembayaran orang tua.
            </p>
          </div>
          <select
            value={selectedSiswaId}
            onChange={(e) => {
              setSelectedSiswaId(e.target.value);
              setSelectedTagihanMap({});
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white max-w-xs"
          >
            {accessibleSiswa.slice(0, 60).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama} ({s.nis}) · {kelasMap.get(s.kelasId) || '-'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Pemilih Anak (jika orang tua memiliki lebih dari 1 anak) */}
      {!isAdminPreview && accessibleSiswa.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {accessibleSiswa.map((s) => {
            const active = s.id === selectedSiswaId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedSiswaId(s.id);
                  setSelectedTagihanMap({});
                }}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {s.nama} · {kelasMap.get(s.kelasId) || '-'}
              </button>
            );
          })}
        </div>
      )}

      {/* Ringkasan Identitas Siswa & KPI */}
      {selectedSiswa && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{selectedSiswa.nama}</h2>
                <StatusSiswaBadge status={selectedSiswa.statusAktif} />
              </div>
              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono tabular-nums">NIS {selectedSiswa.nis}</span>
                <span aria-hidden="true">·</span>
                <span>Kelas {kelasMap.get(selectedSiswa.kelasId) || '-'}</span>
                <span aria-hidden="true">·</span>
                <span>TA {tahunAjaranAktif?.nama || '-'}</span>
                {selectedSiswa.diskonTipe !== 'none' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-teal-800 font-medium">
                      {selectedSiswa.keteranganDiskon || 'Penerima Beasiswa/Diskon'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-500">
              {sekolah?.namaSekolah || 'SMA Negeri 1 Nusantara'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs text-slate-500">Total Sisa Tagihan</div>
              <div className="text-lg font-bold font-mono tabular-nums text-red-700 mt-1">
                {formatRupiah(summary.totalTunggakan)}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs text-slate-500">Tagihan Bulan Berjalan</div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatRupiah(summary.tagihanBulanIni)}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80">
              <div className="text-xs text-slate-500">
                {summary.pendingVerifikasi > 0 ? 'Menunggu Verifikasi' : 'Total Sudah Terbayar'}
              </div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  summary.pendingVerifikasi > 0 ? 'text-amber-700' : 'text-emerald-700'
                }`}
              >
                {formatRupiah(
                  summary.pendingVerifikasi > 0 ? summary.pendingVerifikasi : summary.totalTerbayar
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Panel Pembayaran Online */}
      {selectedSiswa && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Kiri: Pilih Tagihan */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  1. Pilih Tagihan SPP yang Dibayar
                </h3>
                <p className="text-xs text-slate-500">
                  Mendukung pembayaran beberapa bulan sekaligus maupun cicilan sebagian.
                </p>
              </div>
              {unpaidTagihan.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const all: Record<string, number> = {};
                    unpaidTagihan.forEach((t) => {
                      const pending = pendingByTagihan.get(t.id) || 0;
                      const rem = Math.max(0, t.sisaTagihan - pending);
                      all[t.id] = rem > 0 ? rem : t.sisaTagihan;
                    });
                    setSelectedTagihanMap(all);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 whitespace-nowrap shrink-0"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Pilih Semua
                </button>
              )}
            </div>

            {unpaidTagihan.length === 0 ? (
              <div className="py-10 text-center text-sm text-emerald-700 bg-emerald-50/50 border border-emerald-200 rounded-lg">
                Seluruh tagihan SPP untuk {selectedSiswa.nama} sudah lunas. Terima kasih.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {unpaidTagihan.map((t) => {
                  const checked = selectedTagihanMap[t.id] !== undefined;
                  const pendingAmt = pendingByTagihan.get(t.id) || 0;
                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
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
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {namaBulan(t.bulan)} {t.tahun}
                            </span>
                            <StatusTagihanBadge status={t.status} />
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            Tagihan {formatRupiah(t.nominalTagihan)} · Sisa{' '}
                            <span className="font-semibold text-red-700">
                              {formatRupiah(t.sisaTagihan)}
                            </span>
                            <span className="text-slate-400">
                              {' '}
                              · Tempo {formatTanggalSingkat(t.jatuhTempo)}
                            </span>
                          </div>
                          {pendingAmt > 0 && (
                            <div className="text-[11px] text-amber-700 mt-1">
                              Sedang menunggu verifikasi bendahara: {formatRupiah(pendingAmt)}
                            </div>
                          )}
                        </div>
                      </label>

                      {checked && (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-500">Nominal:</span>
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
            )}
          </div>

          {/* Kanan: Kanal Pembayaran & Konfirmasi */}
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                2. Metode &amp; Konfirmasi Pembayaran
              </h3>
              <p className="text-xs text-slate-500">
                Bayar instan melalui gateway Midtrans atau konfirmasi transfer manual ke sekolah.
              </p>
            </div>

            {/* Pemilih Mode Utama: Midtrans vs Transfer Manual */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setPaymentMode('midtrans')}
                className={`py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  paymentMode === 'midtrans'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Midtrans (Instan)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('manual')}
                className={`py-2 px-2.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  paymentMode === 'manual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Transfer Manual
              </button>
            </div>

            {paymentMode === 'midtrans' ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                      <ShieldCheck className="w-4 h-4 text-teal-700" />
                      Pembayaran Online Midtrans Snap
                    </span>
                    <span className="text-[11px] font-medium text-slate-500">
                      {loadingMidtransConfig
                        ? 'Memeriksa...'
                        : midtransConfig?.configured
                        ? midtransConfig.isProduction
                          ? 'Mode Live'
                          : 'Mode Sandbox'
                        : 'Belum Aktif'}
                    </span>
                  </div>

                  <p className="text-slate-600 leading-relaxed">
                    Mendukung Virtual Account (BCA, BRI, BNI, Mandiri, Permata), QRIS, GoPay,
                    ShopeePay, Kartu Kredit/Debit, dan gerai retail melalui popup pembayaran aman
                    Midtrans.
                  </p>

                  <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-slate-600">Total yang Dibayar</span>
                    <span className="text-base font-bold font-mono tabular-nums text-teal-800">
                      {formatRupiah(totalAkanDibayar)}
                    </span>
                  </div>
                </div>

                {!loadingMidtransConfig && !midtransConfig?.configured && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-xs text-amber-950">
                    <p className="leading-relaxed">
                      Integrasi Midtrans siap digunakan, namun{' '}
                      <span className="font-mono font-semibold">MIDTRANS_SERVER_KEY</span> dan{' '}
                      <span className="font-mono font-semibold">MIDTRANS_CLIENT_KEY</span> belum
                      diisi di Secrets / Environment Variables server.
                    </p>
                    <button
                      type="button"
                      onClick={() => setPaymentMode('manual')}
                      className="font-semibold text-teal-800 hover:underline"
                    >
                      Gunakan Konfirmasi Transfer Manual Sekolah →
                    </button>
                  </div>
                )}

                {fallbackSnapUrl && (
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between gap-2 text-xs text-teal-900">
                    <span>Jika popup Snap tidak muncul, buka halaman pembayaran langsung:</span>
                    <a
                      href={fallbackSnapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-teal-800 hover:underline whitespace-nowrap shrink-0"
                    >
                      Buka Midtrans
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    loadingMidtransConfig ||
                    !midtransConfig?.configured ||
                    totalAkanDibayar <= 0
                  }
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  {submitting ? 'Membuat Transaksi Midtrans...' : 'Bayar Sekarang via Midtrans'}
                </button>
              </div>
            ) : (
              <>
                {/* Pemilih Kanal Manual */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                  {(
                    [
                      { id: 'transfer_bank', label: 'Transfer Bank' },
                      { id: 'virtual_account', label: 'Virtual Account' },
                      { id: 'qris', label: 'QRIS Sekolah' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setKanal(opt.id)}
                      className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        kanal === opt.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Info Tujuan Pembayaran */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                  {kanal === 'transfer_bank' && (
                    <>
                      <div className="text-slate-500">Rekening Resmi Sekolah</div>
                      <div className="font-semibold text-slate-900">{namaBank}</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-teal-800 tabular-nums">
                          {noRekening || 'Hubungi Bendahara / Tata Usaha'}
                        </span>
                        {noRekening && (
                          <button
                            type="button"
                            onClick={() => handleCopy('rek', noRekening)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                          >
                            {copiedField === 'rek' ? (
                              <Check className="w-3 h-3" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            {copiedField === 'rek' ? 'Tersalin' : 'Salin'}
                          </button>
                        )}
                      </div>
                      <div className="text-slate-600">a.n. {atasNama}</div>
                    </>
                  )}

                  {kanal === 'virtual_account' && (
                    <>
                      <div className="text-slate-500">Nomor Virtual Account Siswa</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-bold text-teal-800 tabular-nums">
                          {vaNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy('va', vaNumber)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-800 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                        >
                          {copiedField === 'va' ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedField === 'va' ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                      <div className="text-slate-600">
                        a.n. {selectedSiswa.nama} · {sekolah?.namaSekolah || 'SPP SMA'}
                      </div>
                    </>
                  )}

                  {kanal === 'qris' && (
                    <>
                      <div className="text-slate-500">Pembayaran QRIS Sekolah</div>
                      <div className="font-semibold text-slate-900">
                        {sekolah?.namaSekolah || 'SMA Negeri 1 Nusantara'}
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        Scan QRIS resmi Tata Usaha dengan nominal persis sebesar total tagihan
                        yang dipilih, lalu masukkan kode referensi transaksi di bawah.
                      </p>
                    </>
                  )}

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-slate-600">Total yang Dibayar</span>
                    <span className="text-base font-bold font-mono tabular-nums text-teal-800">
                      {formatRupiah(totalAkanDibayar)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Tanggal Transfer
                    </label>
                    <input
                      type="date"
                      value={tanggalTransfer}
                      onChange={(e) => setTanggalTransfer(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      No. Referensi / Bukti
                    </label>
                    <input
                      type="text"
                      value={referensiTransfer}
                      onChange={(e) => setReferensiTransfer(e.target.value)}
                      placeholder="Mis. TRX-90812"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nama Pengirim / Pemilik Rekening
                    </label>
                    <input
                      type="text"
                      value={namaPengirim}
                      onChange={(e) => setNamaPengirim(e.target.value)}
                      required
                      minLength={2}
                      placeholder="Nama lengkap pada rekening pengirim"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Catatan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={catatan}
                      onChange={(e) => setCatatan(e.target.value)}
                      placeholder="Mis. Transfer via m-Banking BCA"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || totalAkanDibayar <= 0}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Mengirim Konfirmasi...' : 'Kirim Konfirmasi Pembayaran'}
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {/* Riwayat Pengajuan Pembayaran Online */}
      {selectedSiswa && siswaPengajuanOrtu.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Status Konfirmasi Pembayaran Online
            </h3>
            <p className="text-xs text-slate-500">
              Pantau proses verifikasi pembayaran yang Anda kirimkan melalui portal.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Kode Ajuan</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Tanggal</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Kanal &amp; Detail</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Rincian Bulan</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Total</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siswaPengajuanOrtu.map((po) => {
                  const isMidtrans = po.kanal === 'midtrans';
                  const isMidtransPaid = isMidtransSettled(po.midtransTransactionStatus);
                  const canResumeSnap =
                    isMidtrans &&
                    po.status === 'menunggu_verifikasi' &&
                    !isMidtransPaid &&
                    Boolean(po.midtransSnapToken) &&
                    Boolean(midtransConfig?.configured);

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {po.kodePengajuan}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatTanggalSingkat(po.tanggalTransfer)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700">
                        <div className="font-medium text-slate-900">
                          {labelKanalOrtu(po.kanal)}
                        </div>
                        {isMidtrans ? (
                          <div className="text-slate-500">
                            {labelMidtransStatus(po.midtransTransactionStatus)}
                            {po.midtransPaymentType ? ` (${po.midtransPaymentType})` : ''}
                          </div>
                        ) : (
                          <div className="text-slate-500">
                            {po.namaPengirim}
                            {po.referensiTransfer ? ` · Ref ${po.referensiTransfer}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs">
                        <div>{po.rincianBulan}</div>
                        {po.status === 'diverifikasi' && po.noKwitansi && (
                          <div className="text-emerald-700 font-mono mt-0.5">
                            Kwitansi: {po.noKwitansi}
                          </div>
                        )}
                        {po.status === 'ditolak' && po.alasanTolak && (
                          <div className="text-red-700 mt-0.5">Alasan: {po.alasanTolak}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatRupiah(po.totalBayar)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusPembayaranOrtuBadge status={po.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-1.5">
                        {isMidtrans && po.status === 'menunggu_verifikasi' && (
                          <>
                            {canResumeSnap && (
                              <button
                                type="button"
                                onClick={() => void handleResumeSnap(po)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md"
                              >
                                Lanjutkan Bayar
                              </button>
                            )}
                            {midtransConfig?.configured && (
                              <button
                                type="button"
                                disabled={checkingOrderId === po.id}
                                onClick={() => void handleCheckStatusRow(po)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-md"
                              >
                                <RefreshCw className="w-3 h-3" />
                                {checkingOrderId === po.id ? 'Mengecek...' : 'Cek Status'}
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Riwayat Kwitansi Resmi */}
      {selectedSiswa && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Riwayat Pembayaran Sah &amp; Kwitansi Resmi
              </h3>
              <p className="text-xs text-slate-500">
                Unduh atau cetak kwitansi resmi SPP anak Anda kapan saja.
              </p>
            </div>
            <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">No. Kwitansi</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Tanggal</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Rincian Bulan</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Metode</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Total</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Kwitansi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siswaPembayaranSah.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-sm text-slate-500">
                      Belum ada pembayaran SPP yang tercatat sah.
                    </td>
                  </tr>
                ) : (
                  siswaPembayaranSah.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {p.noKwitansi}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatTanggalSingkat(p.tanggalBayar)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 max-w-xs">
                        {p.rincianBulan}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 capitalize">{p.metode}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatRupiah(p.totalBayar)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusPembayaranBadge status={p.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setActiveKwitansi({ pembayaran: p })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          Kwitansi PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daftar Seluruh Tagihan Bulanan Anak */}
      {selectedSiswa && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Rekap Seluruh Tagihan Bulanan
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Periode</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Tagihan</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Terbayar</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Sisa</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Jatuh Tempo</th>
                  <th className="py-2.5 px-4 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siswaTagihan.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-sm text-slate-500">
                      Belum ada tagihan SPP yang diterbitkan untuk siswa ini.
                    </td>
                  </tr>
                ) : (
                  siswaTagihan.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {namaBulan(t.bulan)} {t.tahun}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(t.nominalTagihan)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                        {formatRupiah(t.totalTerbayar)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {formatRupiah(t.sisaTagihan)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {formatTanggalSingkat(t.jatuhTempo)}
                      </td>
                      <td className="py-2.5 px-4">
                        <StatusTagihanBadge status={t.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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

import { useEffect, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import { formatRupiah, formatTanggalIndonesia, namaBulan } from '../lib/format.ts';
import { cetakPdfKwitansi } from '../services/exportService.ts';
import { ambilDetailPembayaran } from '../services/pembayaranService.ts';
import type { Pembayaran, PembayaranDetail, PengaturanSekolah } from '../types/spp.ts';

interface Props {
  pembayaran: Pembayaran;
  initialDetails?: PembayaranDetail[];
  sekolah: PengaturanSekolah | null;
  onClose: () => void;
}

export function KwitansiPrintModal({ pembayaran, initialDetails, sekolah, onClose }: Props) {
  const [details, setDetails] = useState<PembayaranDetail[]>(initialDetails || []);
  const [loading, setLoading] = useState(!initialDetails);

  useEffect(() => {
    if (initialDetails) return;
    let active = true;
    ambilDetailPembayaran(pembayaran.id)
      .then((res) => {
        if (active) setDetails(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pembayaran.id, initialDetails]);

  const namaSekolah = sekolah?.namaSekolah || 'SMA Negeri 1 Nusantara';
  const alamat = sekolah?.alamat || 'Jl. Pendidikan Merdeka No. 45';
  const telepon = sekolah?.telepon || '-';
  const kota = sekolah?.kota || 'Bandung';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden print-container">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 no-print">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Pratinjau Kwitansi Pembayaran</h3>
            <p className="text-xs text-slate-500 font-mono tabular-nums">{pembayaran.noKwitansi}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cetakPdfKwitansi(pembayaran, details, sekolah)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup kwitansi"
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6 bg-white relative">
          {/* Kop Sekolah */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{namaSekolah}</h2>
              <p className="text-xs text-slate-600 mt-0.5">{alamat}</p>
              <p className="text-xs text-slate-600">Telp: {telepon}</p>
            </div>
            <div className="sm:text-right">
              <div className="text-xs font-semibold text-teal-800 tracking-wide">KWITANSI RESMI SPP</div>
              <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                {pembayaran.noKwitansi}
              </div>
            </div>
          </div>

          {pembayaran.status === 'dibatalkan' && (
            <div className="border border-red-300 bg-red-50 rounded-lg px-4 py-3 text-sm text-red-800">
              <div className="font-semibold">TRANSAKSI DIBATALKAN</div>
              <div className="text-xs mt-0.5">
                Alasan: {pembayaran.alasanBatal} · Oleh: {pembayaran.dibatalkanOleh}
              </div>
            </div>
          )}

          {/* Identitas Siswa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Nama Siswa & NIS</div>
              <div className="font-semibold text-slate-900">
                {pembayaran.siswaNama}{' '}
                <span className="font-mono text-xs font-normal text-slate-500">
                  ({pembayaran.siswaNis})
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Kelas</div>
              <div className="font-medium text-slate-900">{pembayaran.kelasNama}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Tanggal Pembayaran</div>
              <div className="font-medium text-slate-900">
                {formatTanggalIndonesia(pembayaran.tanggalBayar)}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-500">Metode Pembayaran</div>
              <div className="font-medium text-slate-900">
                {pembayaran.metode === 'tunai' ? 'Tunai (Loket Sekolah)' : 'Transfer Bank'}
              </div>
            </div>
          </div>

          {/* Rincian Bulan */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold w-12">No</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Keterangan Tagihan</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-4 px-3 text-center text-xs text-slate-500">
                      Memuat rincian pembayaran...
                    </td>
                  </tr>
                ) : details.length > 0 ? (
                  details.map((d, index) => (
                    <tr key={d.id}>
                      <td className="py-2.5 px-3 text-slate-500 tabular-nums">{index + 1}</td>
                      <td className="py-2.5 px-3 text-slate-900">
                        SPP Bulan {namaBulan(d.bulan)} {d.tahun}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatRupiah(d.nominalDialokasikan)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-2.5 px-3 text-slate-500">1</td>
                    <td className="py-2.5 px-3 text-slate-900">{pembayaran.rincianBulan}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                      {formatRupiah(pembayaran.totalBayar)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-semibold">
                <tr>
                  <td colSpan={2} className="py-2.5 px-3 text-slate-900">
                    Total Pembayaran
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-800">
                    {formatRupiah(pembayaran.totalBayar)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {pembayaran.catatan && (
            <div className="text-xs text-slate-600">
              <span className="font-medium text-slate-700">Catatan:</span> {pembayaran.catatan}
            </div>
          )}

          {/* Footer TTD */}
          <div className="pt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-t border-slate-100">
            <div className="text-xs text-slate-500 max-w-xs">
              Simpan kwitansi ini sebagai bukti pembayaran SPP yang sah. Diterbitkan oleh sistem administrasi {namaSekolah}.
            </div>
            <div className="sm:text-right text-sm">
              <div className="text-xs text-slate-600">
                {kota}, {formatTanggalIndonesia(pembayaran.tanggalBayar)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Petugas / Bendahara,</div>
              <div className="font-semibold text-slate-900 mt-8">{pembayaran.petugasNama}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatRupiah, formatTanggalIndonesia, namaBulan } from '../lib/format.ts';
import type { Pembayaran, PembayaranDetail, PengaturanSekolah } from '../types/spp.ts';

export function cetakPdfKwitansi(
  pembayaran: Pembayaran,
  details: PembayaranDetail[],
  sekolah: PengaturanSekolah | null
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const namaSekolah = sekolah?.namaSekolah || 'SMA Negeri 1 Nusantara';
  const alamatSekolah = sekolah?.alamat || 'Jl. Pendidikan Merdeka No. 45';
  const telepon = sekolah?.telepon || '-';
  const kota = sekolah?.kota || 'Bandung';

  // Kop Surat
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(namaSekolah.toUpperCase(), 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(`${alamatSekolah} | Telp: ${telepon}`, 14, 24);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(14, 27, 196, 27);

  // Judul Kwitansi
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('KWITANSI PEMBAYARAN SPP', 14, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`No. Kwitansi : ${pembayaran.noKwitansi}`, 125, 35);
  doc.text(`Tanggal Bayar: ${formatTanggalIndonesia(pembayaran.tanggalBayar)}`, 125, 41);

  // Status jika dibatalkan
  if (pembayaran.status === 'dibatalkan') {
    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('STATUS: DIBATALKAN', 14, 43);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Alasan Batal: ${pembayaran.alasanBatal}`, 14, 48);
    doc.setTextColor(15, 23, 42);
  }

  // Data Siswa
  const startY = pembayaran.status === 'dibatalkan' ? 55 : 48;
  doc.setFontSize(10);
  doc.text(`NIS / Nama Siswa : ${pembayaran.siswaNis} — ${pembayaran.siswaNama}`, 14, startY);
  doc.text(`Kelas            : ${pembayaran.kelasNama}`, 14, startY + 6);
  doc.text(
    `Metode Bayar     : ${pembayaran.metode === 'tunai' ? 'Tunai (Kas Tata Usaha)' : 'Transfer Bank'}`,
    14,
    startY + 12
  );

  // Tabel Rincian Bulan
  const tableRows =
    details.length > 0
      ? details.map((d, idx) => [
          String(idx + 1),
          `SPP Bulan ${namaBulan(d.bulan)} ${d.tahun}`,
          formatRupiah(d.nominalDialokasikan),
        ])
      : [['1', pembayaran.rincianBulan || 'Pembayaran SPP', formatRupiah(pembayaran.totalBayar)]];

  autoTable(doc, {
    startY: startY + 18,
    head: [['No', 'Keterangan Pembayaran', 'Nominal Dibayar']],
    body: tableRows,
    foot: [['', 'TOTAL PEMBAYARAN', formatRupiah(pembayaran.totalBayar)]],
    theme: 'grid',
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 9.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 50, halign: 'right' },
    },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || startY + 55) + 12;

  if (pembayaran.catatan) {
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Catatan: ${pembayaran.catatan}`, 14, finalY);
  }

  // Tanda Tangan Petugas
  const sigY = finalY + 12;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.text(`${kota}, ${formatTanggalIndonesia(pembayaran.tanggalBayar)}`, 135, sigY);
  doc.text('Petugas / Bendahara,', 135, sigY + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(pembayaran.petugasNama, 135, sigY + 24);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Dokumen sah ini diterbitkan secara elektronik oleh Sistem Pendataan SPP.', 14, sigY + 24);

  doc.save(`${pembayaran.noKwitansi}.pdf`);
}

export function eksporLaporanExcel(
  rows: Array<Record<string, string | number>>,
  sheetName: string,
  filename: string
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function eksporLaporanPdf(params: {
  judul: string;
  subjudul: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  ringkasan: string[];
  filename: string;
  sekolah: PengaturanSekolah | null;
}): void {
  const { judul, subjudul, columns, rows, ringkasan, filename, sekolah } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const namaSekolah = sekolah?.namaSekolah || 'SMA Negeri 1 Nusantara';
  const alamat = sekolah?.alamat || 'Jl. Pendidikan Merdeka No. 45';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(namaSekolah.toUpperCase(), 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(alamat, 14, 21);
  doc.setDrawColor(15, 23, 42);
  doc.line(14, 24, 196, 24);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(judul, 14, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(subjudul, 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [columns],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 120) + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  ringkasan.forEach((line, i) => {
    doc.text(line, 14, finalY + i * 6);
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

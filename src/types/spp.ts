export type ActiveRole = 'admin' | 'petugas' | 'kepala_sekolah' | 'orang_tua';
export type UserRole = ActiveRole | 'pending';

export interface AppUser {
  id: string;
  uid: string;
  nama: string;
  email: string;
  peran: UserRole;
  aktif: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoleInvite {
  id: string;
  email: string;
  nama: string;
  peran: ActiveRole;
  createdBy: string;
  createdAt?: unknown;
}

export interface PengaturanSekolah {
  id: string;
  namaSekolah: string;
  alamat: string;
  telepon: string;
  email: string;
  kota: string;
  namaKepalaSekolah: string;
  namaBank?: string;
  noRekening?: string;
  atasNamaRekening?: string;
  updatedAt?: unknown;
}

export interface TahunAjaran {
  id: string;
  nama: string;
  aktif: boolean;
  createdAt?: unknown;
}

export type TingkatKelas = '10' | '11' | '12';

export interface Kelas {
  id: string;
  nama: string;
  tingkat: TingkatKelas;
  tahunAjaranId: string;
  createdAt?: unknown;
}

export interface TarifSpp {
  id: string;
  kelasId: string;
  tahunAjaranId: string;
  nominal: number;
  updatedAt?: unknown;
}

export type StatusSiswa = 'aktif' | 'lulus' | 'pindah' | 'nonaktif';
export type DiskonTipe = 'none' | 'nominal' | 'persen';

export interface Siswa {
  id: string;
  nis: string;
  nama: string;
  kelasId: string;
  statusAktif: StatusSiswa;
  noHpOrtu: string;
  emailOrtu?: string;
  diskonTipe: DiskonTipe;
  diskonNilai: number;
  keteranganDiskon: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type StatusTagihan = 'belum_bayar' | 'sebagian' | 'lunas';

export interface TagihanSpp {
  id: string;
  siswaId: string;
  kelasId: string;
  tahunAjaranId: string;
  emailOrtu?: string;
  bulan: number;
  tahun: number;
  nominalTarif: number;
  nominalDiskon: number;
  nominalTagihan: number;
  totalTerbayar: number;
  sisaTagihan: number;
  status: StatusTagihan;
  jatuhTempo: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type MetodePembayaran = 'tunai' | 'transfer';
export type StatusPembayaran = 'sah' | 'dibatalkan';

export interface Pembayaran {
  id: string;
  noKwitansi: string;
  siswaId: string;
  siswaNis: string;
  siswaNama: string;
  kelasId: string;
  kelasNama: string;
  emailOrtu?: string;
  tanggalBayar: string;
  metode: MetodePembayaran;
  totalBayar: number;
  petugasUid: string;
  petugasNama: string;
  catatan: string;
  status: StatusPembayaran;
  alasanBatal: string;
  dibatalkanOleh: string;
  dibatalkanPada: string;
  rincianBulan: string;
  createdAt?: unknown;
}

export interface PembayaranDetail {
  id: string;
  pembayaranId: string;
  tagihanId: string;
  siswaId: string;
  emailOrtu?: string;
  bulan: number;
  tahun: number;
  nominalDialokasikan: number;
  status: StatusPembayaran;
  createdAt?: unknown;
}

export type KanalPembayaranOrtu = 'midtrans' | 'transfer_bank' | 'qris' | 'virtual_account';
export type StatusPembayaranOrtu = 'menunggu_verifikasi' | 'diverifikasi' | 'ditolak';

export interface PembayaranOrtuItem {
  tagihanId: string;
  bulan: number;
  tahun: number;
  bayarNominal: number;
}

export interface PembayaranOrtu {
  id: string;
  kodePengajuan: string;
  siswaId: string;
  siswaNis: string;
  siswaNama: string;
  kelasId: string;
  kelasNama: string;
  orangTuaUid: string;
  orangTuaNama: string;
  emailOrtu: string;
  tanggalTransfer: string;
  kanal: KanalPembayaranOrtu;
  namaPengirim: string;
  referensiTransfer: string;
  catatan: string;
  totalBayar: number;
  rincianBulan: string;
  items: PembayaranOrtuItem[];
  status: StatusPembayaranOrtu;
  pembayaranId: string;
  noKwitansi: string;
  diprosesOleh: string;
  diprosesPada: string;
  alasanTolak: string;
  midtransOrderId?: string;
  midtransSnapToken?: string;
  midtransRedirectUrl?: string;
  midtransTransactionStatus?: string;
  midtransPaymentType?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AksiAudit = 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'GENERATE' | 'SEED';

export interface LogAktivitas {
  id: string;
  actorUid: string;
  actorNama: string;
  actorPeran: string;
  aksi: AksiAudit;
  entitas: string;
  entitasId: string;
  ringkasan: string;
  createdAt?: unknown;
}

export type PageRoute =
  | 'dashboard'
  | 'master'
  | 'tagihan'
  | 'pembayaran'
  | 'tunggakan'
  | 'laporan'
  | 'audit'
  | 'portal_ortu';

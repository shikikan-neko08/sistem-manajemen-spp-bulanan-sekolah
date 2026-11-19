import React, { useState } from 'react';
import { KeyRound, LogIn, LogOut, Mail, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

type AuthMode = 'login' | 'register' | 'reset';

export function LoginPage() {
  const {
    firebaseUser,
    profile,
    needsEmailVerification,
    authError,
    authNotice,
    popupBlockedHint,
    clearAuthMessages,
    loginGoogle,
    loginGoogleRedirect,
    loginEmail,
    registerEmail,
    resetPasswordEmail,
    resendVerificationEmail,
    reloadVerificationStatus,
    logout,
    loading,
  } = useAuth();
  const isStandalone = typeof window !== 'undefined' && window.self === window.top;

  const [mode, setMode] = useState<AuthMode>('login');
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    clearAuthMessages();
  };

  if (firebaseUser && needsEmailVerification) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Verifikasi Email Diperlukan</h1>
              <p className="text-xs text-slate-500">{firebaseUser.email}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Kami telah mengirim tautan verifikasi ke email Anda. Silakan buka kotak masuk (atau
            folder spam), klik tautan verifikasi, lalu tekan tombol di bawah ini untuk melanjutkan.
          </p>

          {authNotice && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {authNotice}
            </div>
          )}
          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {authError}
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await reloadVerificationStatus();
                setBusy(false);
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {busy ? 'Memeriksa...' : 'Saya Sudah Verifikasi (Lanjutkan)'}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await resendVerificationEmail();
                setBusy(false);
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors"
            >
              Kirim Ulang Email Verifikasi
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Keluar dan Ganti Akun
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (firebaseUser && profile?.peran === 'pending') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Menunggu Persetujuan Admin</h1>
              <p className="text-xs text-slate-500">{profile.email}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Akun Anda sudah terdaftar, namun Admin sekolah belum menetapkan peran akses Anda
            (Admin, Petugas/Bendahara, atau Kepala Sekolah). Silakan hubungi Admin Tata Usaha untuk
            mengaktifkan akun Anda.
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Keluar dan Ganti Akun
          </button>
        </div>
      </div>
    );
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await loginEmail(email, password);
      } else if (mode === 'register') {
        await registerEmail(nama, email, password);
      } else {
        await resetPasswordEmail(email);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-teal-700 tracking-wide">
            SISTEM ADMINISTRASI KEUANGAN SEKOLAH
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight text-balance">
            SIP-SPP SMA
          </h1>
          <p className="text-sm text-slate-600">
            Pendataan SPP bulanan, penagihan otomatis, pembayaran cicilan, kwitansi PDF, dan
            laporan keuangan sekolah.
          </p>
        </div>

        {/* Mode Switcher: Masuk / Daftar */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Masuk dengan Email
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
              mode === 'register'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daftar Akun Baru
          </button>
        </div>

        {authNotice && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
            {authNotice}
          </div>
        )}
        {authError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {authError}
          </div>
        )}

        <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nama Lengkap</label>
              <input
                type="text"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                required
                placeholder="Nama petugas / kepala sekolah"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alamat Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="nama@sekolah.sch.id"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">Kata Sandi</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs font-medium text-teal-700 hover:underline"
                  >
                    Lupa kata sandi?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Minimal 6 karakter"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy || loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors"
          >
            {mode === 'login' && <LogIn className="w-4 h-4" />}
            {mode === 'register' && <UserPlus className="w-4 h-4" />}
            {mode === 'reset' && <KeyRound className="w-4 h-4" />}
            {busy
              ? 'Memproses...'
              : mode === 'login'
              ? 'Masuk dengan Email'
              : mode === 'register'
              ? 'Daftar & Kirim Verifikasi'
              : 'Kirim Link Reset Kata Sandi'}
          </button>

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full text-xs font-medium text-slate-600 hover:text-slate-900 py-1"
            >
              Kembali ke halaman masuk
            </button>
          )}
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-slate-500">atau</span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void loginGoogle()}
          className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
        >
          Masuk dengan Akun Google
        </button>

        {popupBlockedHint && isStandalone && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2 text-xs text-amber-900">
            <p className="leading-relaxed">
              Jika pop-up tetap diblokir oleh ekstensi/browser, Anda dapat mengizinkan pop-up di
              pengaturan situs browser, masuk menggunakan <strong>Email &amp; Kata Sandi</strong> di
              atas, atau mencoba mode redirect (memerlukan konfigurasi domain auth same-origin).
            </p>
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void loginGoogleRedirect()}
              className="w-full px-3 py-2 text-xs font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100/60 rounded-lg transition-colors"
            >
              Coba Login Google via Redirect (Cadangan)
            </button>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-600">
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-semibold text-slate-900">Admin</div>
            <p className="mt-0.5">Akses penuh seluruh data & pengguna.</p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-semibold text-slate-900">Petugas</div>
            <p className="mt-0.5">Kelola tagihan, bayar & kwitansi.</p>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
            <div className="font-semibold text-slate-900">Kepala Sekolah</div>
            <p className="mt-0.5">Lihat dashboard & laporan.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

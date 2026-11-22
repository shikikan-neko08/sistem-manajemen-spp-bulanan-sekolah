import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase.ts';
import { emailToKey } from '../lib/format.ts';
import type { ActiveRole, AppUser, UserRole } from '../types/spp.ts';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: AppUser | null;
  effectiveRole: UserRole;
  previewRole: ActiveRole | null;
  setPreviewRole: (role: ActiveRole | null) => void;
  loading: boolean;
  needsEmailVerification: boolean;
  authError: string | null;
  authNotice: string | null;
  popupBlockedHint: boolean;
  clearAuthMessages: () => void;
  loginGoogle: () => Promise<void>;
  loginGoogleRedirect: () => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (nama: string, email: string, password: string) => Promise<void>;
  resetPasswordEmail: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadVerificationStatus: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  canManageMaster: boolean;
  canTransact: boolean;
  canViewAudit: boolean;
  isParent: boolean;
}

const REDIRECT_PENDING_KEY = 'spp_google_redirect_pending';

const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Login Email/Kata Sandi belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password → Enable).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email atau kata sandi salah.';
    case 'auth/email-already-in-use':
      return 'Email ini sudah terdaftar. Silakan masuk menggunakan email dan kata sandi Anda.';
    case 'auth/weak-password':
      return 'Kata sandi terlalu lemah. Gunakan minimal 6 karakter.';
    case 'auth/invalid-email':
      return 'Format alamat email tidak valid.';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit lalu coba lagi.';
    case 'auth/popup-closed-by-user':
      return 'Jendela login Google ditutup sebelum selesai.';
    case 'auth/popup-blocked':
      return 'Popup login Google diblokir oleh browser atau ekstensi (ad-blocker). Izinkan pop-up untuk situs ini di bilah alamat browser, atau gunakan login Email & Kata Sandi di atas.';
    case 'auth/unauthorized-domain':
      return 'Domain aplikasi belum diizinkan di Firebase Authentication. Tambahkan domain Vercel Anda ke Firebase Console → Authentication → Settings → Authorized domains.';
    default:
      return err instanceof Error ? err.message : 'Autentikasi gagal. Silakan coba lagi.';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [previewRole, setPreviewRole] = useState<ActiveRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [popupBlockedHint, setPopupBlockedHint] = useState(false);

  const syncOrCreateUserProfile = async (fbUser: FirebaseUser): Promise<AppUser> => {
    const userPath = `users/${fbUser.uid}`;
    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);
      const email = (fbUser.email || '').toLowerCase();
      if (snap.exists()) {
        const existingData = snap.data() as Omit<AppUser, 'id'>;
        if (existingData.peran === 'pending' && email && fbUser.emailVerified) {
          const inviteSnap = await getDoc(doc(db, 'role_invites', emailToKey(email)));
          if (inviteSnap.exists()) {
            const inviteData = inviteSnap.data() as { peran?: ActiveRole };
            if (inviteData.peran) {
              await updateDoc(userRef, {
                peran: inviteData.peran,
                aktif: true,
                updatedAt: serverTimestamp(),
              });
              const upgraded = await getDoc(userRef);
              return { id: upgraded.id, ...(upgraded.data() as Omit<AppUser, 'id'>) };
            }
          }
        }
        return { id: snap.id, ...existingData };
      }
      let assignedRole: UserRole = 'pending';
      let assignedName = fbUser.displayName || email.split('@')[0] || 'Pengguna';

      if (email === BOOTSTRAPPED_ADMIN_EMAIL && fbUser.emailVerified) {
        assignedRole = 'admin';
      } else if (email && fbUser.emailVerified) {
        const inviteKey = emailToKey(email);
        const inviteSnap = await getDoc(doc(db, 'role_invites', inviteKey));
        if (inviteSnap.exists()) {
          const inviteData = inviteSnap.data() as { peran?: ActiveRole; nama?: string };
          if (inviteData.peran) assignedRole = inviteData.peran;
          if (inviteData.nama) assignedName = inviteData.nama;
        }
      }

      const newUserPayload = {
        uid: fbUser.uid,
        nama: assignedName.slice(0, 120),
        email,
        peran: assignedRole,
        aktif: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(userRef, newUserPayload);
      const created = await getDoc(userRef);
      return { id: created.id, ...(created.data() as Omit<AppUser, 'id'>) };
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const initAuth = async () => {
      let redirectErrorMsg: string | null = null;
      let redirectBouncedEmpty = false;
      const hadPendingRedirect =
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1';

      try {
        const result = await getRedirectResult(auth);
        if (hadPendingRedirect) {
          window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          if (!result?.user && !auth.currentUser) {
            redirectBouncedEmpty = true;
            redirectErrorMsg =
              'Login Google via redirect kembali tanpa sesi aktif karena browser memblokir penyimpanan lintas domain. Izinkan pop-up untuk situs ini lalu klik "Masuk dengan Akun Google", atau masuk menggunakan Email & Kata Sandi.';
          }
        }
      } catch (err) {
        if (hadPendingRedirect && typeof window !== 'undefined') {
          window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        }
        redirectErrorMsg = mapFirebaseAuthError(err);
      }

      if (cancelled) return;

      if (redirectErrorMsg) {
        setAuthError(redirectErrorMsg);
        if (redirectBouncedEmpty) {
          setPopupBlockedHint(true);
        }
      }

      unsub = onAuthStateChanged(auth, async (fbUser) => {
        if (cancelled) return;
        setLoading(true);
        if (!fbUser) {
          setFirebaseUser(null);
          setProfile(null);
          setPreviewRole(null);
          setNeedsEmailVerification(false);
          setLoading(false);
          return;
        }

        setAuthError(null);
        setPopupBlockedHint(false);
        setFirebaseUser(fbUser);
        if (!fbUser.emailVerified) {
          setProfile(null);
          setNeedsEmailVerification(true);
          setLoading(false);
          return;
        }

        setNeedsEmailVerification(false);
        try {
          const prof = await syncOrCreateUserProfile(fbUser);
          if (!cancelled) {
            setProfile(prof);
          }
        } catch (err) {
          if (!cancelled) {
            setAuthError(err instanceof Error ? err.message : 'Gagal memuat profil pengguna.');
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      });
    };

    void initAuth();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  const refreshProfile = async () => {
    if (!firebaseUser || !firebaseUser.emailVerified) return;
    const prof = await syncOrCreateUserProfile(firebaseUser);
    setProfile(prof);
  };

  const loginGoogle = async () => {
    setAuthError(null);
    setAuthNotice(null);
    setPopupBlockedHint(false);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        setPopupBlockedHint(true);
      }
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const loginGoogleRedirect = async () => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
      }
      await signInWithRedirect(auth, googleAuthProvider);
    } catch (err) {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      }
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const loginEmail = async (email: string, password: string) => {
    setAuthError(null);
    setAuthNotice(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const registerEmail = async (nama: string, email: string, password: string) => {
    setAuthError(null);
    setAuthNotice(null);
    const cleanName = nama.trim();
    if (cleanName.length < 2) {
      setAuthError('Nama lengkap minimal 2 karakter.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Kata sandi minimal 6 karakter.');
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: cleanName });
      await sendEmailVerification(cred.user);
      setAuthNotice(
        `Akun berhasil dibuat. Link verifikasi telah dikirim ke ${email.trim()}.`
      );
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const resetPasswordEmail = async (email: string) => {
    setAuthError(null);
    setAuthNotice(null);
    if (!email.trim().includes('@')) {
      setAuthError('Masukkan alamat email yang valid.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthNotice(
        `Tautan atur ulang kata sandi telah dikirim ke ${email.trim()}. Periksa kotak masuk atau folder spam.`
      );
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    setAuthNotice(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setAuthNotice('Email verifikasi telah dikirim ulang. Silakan periksa kotak masuk Anda.');
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const reloadVerificationStatus = async () => {
    if (!auth.currentUser) return;
    setAuthError(null);
    setAuthNotice(null);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const updated = auth.currentUser;
      setFirebaseUser(updated);
      if (updated.emailVerified) {
        setNeedsEmailVerification(false);
        const prof = await syncOrCreateUserProfile(updated);
        setProfile(prof);
      } else {
        setAuthError(
          'Email Anda belum terverifikasi. Pastikan sudah mengklik tautan verifikasi di kotak masuk email Anda.'
        );
      }
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err));
    }
  };

  const logout = async () => {
    setPreviewRole(null);
    setNeedsEmailVerification(false);
    setAuthError(null);
    setAuthNotice(null);
    await signOut(auth);
  };

  const realRole: UserRole = profile?.peran || 'pending';
  const effectiveRole: UserRole =
    realRole === 'admin' && previewRole ? previewRole : realRole;

  const canManageMaster = effectiveRole === 'admin';
  const canTransact = effectiveRole === 'admin' || effectiveRole === 'petugas';
  const canViewAudit = effectiveRole === 'admin' || effectiveRole === 'kepala_sekolah';
  const isParent = effectiveRole === 'orang_tua';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        effectiveRole,
        previewRole,
        setPreviewRole,
        loading,
        needsEmailVerification,
        authError,
        authNotice,
        popupBlockedHint,
        clearAuthMessages: () => {
          setAuthError(null);
          setAuthNotice(null);
          setPopupBlockedHint(false);
        },
        loginGoogle,
        loginGoogleRedirect,
        loginEmail,
        registerEmail,
        resetPasswordEmail,
        resendVerificationEmail,
        reloadVerificationStatus,
        logout,
        refreshProfile,
        canManageMaster,
        canTransact,
        canViewAudit,
        isParent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return ctx;
}

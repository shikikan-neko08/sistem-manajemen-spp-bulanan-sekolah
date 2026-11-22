import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Layout } from './components/Layout.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { SppDataProvider, useSppData } from './contexts/SppDataContext.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LaporanPage } from './pages/LaporanPage.tsx';
import { LogAktivitasPage } from './pages/LogAktivitasPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { MasterDataPage } from './pages/MasterDataPage.tsx';
import { PembayaranPage } from './pages/PembayaranPage.tsx';
import { PortalOrangTuaPage } from './pages/PortalOrangTuaPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TagihanPage } from './pages/TagihanPage.tsx';
import { TunggakanPage } from './pages/TunggakanPage.tsx';
import type { PageRoute } from './types/spp.ts';

function AppShell() {
  const { firebaseUser, profile, loading, effectiveRole, canTransact } = useAuth();
  const { permissions } = useSppData();
  const [activeRoute, setActiveRoute] = useState<PageRoute>('dashboard');
  const [preselectedSiswaId, setPreselectedSiswaId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-sm text-slate-600">Memuat sistem SPP SMA...</div>
      </div>
    );
  }

  if (!firebaseUser || !profile || profile.peran === 'pending' || !profile.aktif) {
    return <LoginPage />;
  }

  const handleBayarSiswa = (siswaId: string) => {
    setPreselectedSiswaId(siswaId);
    setActiveRoute('pembayaran');
  };

  const resolvedRoute: PageRoute =
    effectiveRole === 'orang_tua'
      ? 'portal_ortu'
      : activeRoute === 'portal_ortu'
      ? 'dashboard'
      : activeRoute;

  const renderPage = () => {
    if (effectiveRole === 'orang_tua') {
      return <PortalOrangTuaPage />;
    }

    switch (resolvedRoute) {
      case 'master':
        return permissions.canViewMaster ? (
          <MasterDataPage />
        ) : (
          <DashboardPage onNavigate={setActiveRoute} />
        );
      case 'tagihan':
        return canTransact ? <TagihanPage /> : <DashboardPage onNavigate={setActiveRoute} />;
      case 'pembayaran':
        return canTransact ? (
          <PembayaranPage
            preselectedSiswaId={preselectedSiswaId}
            onClearPreselect={() => setPreselectedSiswaId(null)}
          />
        ) : (
          <DashboardPage onNavigate={setActiveRoute} />
        );
      case 'tunggakan':
        return <TunggakanPage onBayarSiswa={handleBayarSiswa} />;
      case 'laporan':
        return <LaporanPage />;
      case 'audit':
        return permissions.canViewAudit ? (
          <LogAktivitasPage />
        ) : (
          <DashboardPage onNavigate={setActiveRoute} />
        );
      case 'settings':
        return effectiveRole === 'admin' ? (
          <SettingsPage />
        ) : (
          <DashboardPage onNavigate={setActiveRoute} />
        );
      case 'dashboard':
      default:
        return <DashboardPage onNavigate={setActiveRoute} />;
    }
  };

  return (
    <Layout activeRoute={resolvedRoute} onNavigate={setActiveRoute}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SppDataProvider>
          <AppShell />
        </SppDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

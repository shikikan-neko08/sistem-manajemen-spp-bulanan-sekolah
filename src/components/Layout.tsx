import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { labelPeran } from '../lib/format.ts';
import type { ActiveRole, PageRoute } from '../types/spp.ts';

interface Props {
  activeRoute: PageRoute;
  onNavigate: (route: PageRoute) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: PageRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
}

export function Layout({ activeRoute, onNavigate, children }: Props) {
  const {
    profile,
    effectiveRole,
    previewRole,
    setPreviewRole,
    logout,
    canManageMaster,
    canTransact,
    canViewAudit,
  } = useAuth();
  const { sekolah, tahunAjaranAktif, autoGenerateNotice, dismissAutoGenerateNotice } = useSppData();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true },
    {
      id: 'master',
      label: 'Data Master',
      icon: BookOpen,
      visible: canManageMaster || effectiveRole === 'petugas',
    },
    { id: 'tagihan', label: 'Tagihan Bulanan', icon: ClipboardList, visible: canTransact },
    { id: 'pembayaran', label: 'Pembayaran & Kwitansi', icon: CreditCard, visible: canTransact },
    { id: 'tunggakan', label: 'Daftar Tunggakan', icon: AlertCircle, visible: true },
    { id: 'laporan', label: 'Laporan Keuangan', icon: FileSpreadsheet, visible: true },
    { id: 'audit', label: 'Log Aktivitas', icon: History, visible: canViewAudit },
  ];

  const activeTitle = navItems.find((n) => n.id === activeRoute)?.label || 'Dashboard';

  const handleNav = (route: PageRoute) => {
    onNavigate(route);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">SIP-SPP SMA</div>
            <div className="text-xs text-slate-500 truncate">
              {sekolah?.namaSekolah || 'Administrasi SPP'}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
      </nav>

      {/* Panel Akun & Pengalih Pratinjau Peran untuk Admin */}
      <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/70">
        {profile?.peran === 'admin' && (
          <div className="space-y-1">
            <label
              htmlFor="role-preview-select"
              className="block text-[11px] font-medium text-slate-500"
            >
              Pratinjau Peran
            </label>
            <select
              id="role-preview-select"
              value={previewRole || 'admin'}
              onChange={(e) => {
                const val = e.target.value as ActiveRole;
                setPreviewRole(val === 'admin' ? null : val);
                if (val === 'kepala_sekolah' && ['master', 'tagihan', 'pembayaran'].includes(activeRoute)) {
                  onNavigate('dashboard');
                }
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="admin">Admin (Penuh)</option>
              <option value="petugas">Petugas / Bendahara</option>
              <option value="kepala_sekolah">Kepala Sekolah</option>
            </select>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 truncate">{profile?.nama}</div>
            <div className="text-[11px] text-slate-500 truncate">
              {labelPeran(effectiveRole)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title="Keluar"
            className="p-2 text-slate-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] z-50">
            <div className="relative h-full">
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
              {sidebarContent}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Buka menu navigasi"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
              {activeTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
            <span className="hidden sm:inline whitespace-nowrap">
              TA {tahunAjaranAktif?.nama || '-'}
            </span>
            <span className="hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="font-medium text-slate-700 whitespace-nowrap">
              {labelPeran(effectiveRole)}
            </span>
          </div>
        </header>

        {autoGenerateNotice && (
          <div className="mx-4 sm:mx-6 mt-4 px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-lg flex items-center justify-between gap-3 text-xs text-teal-900 no-print">
            <span>{autoGenerateNotice}</span>
            <button
              type="button"
              onClick={dismissAutoGenerateNotice}
              className="text-teal-700 hover:text-teal-900 font-medium whitespace-nowrap"
            >
              Tutup
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

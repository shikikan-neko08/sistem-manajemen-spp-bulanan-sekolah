import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useSppData } from '../contexts/SppDataContext.tsx';
import { formatTimestamp, labelPeran } from '../lib/format.ts';

export function LogAktivitasPage() {
  const { logList } = useSppData();
  const [filterAksi, setFilterAksi] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logList.filter((l) => {
      if (filterAksi !== 'all' && l.aksi !== filterAksi) return false;
      if (
        q &&
        !l.ringkasan.toLowerCase().includes(q) &&
        !l.actorNama.toLowerCase().includes(q) &&
        !l.entitas.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [logList, filterAksi, searchQuery]);

  const badgeClass = (aksi: string) => {
    switch (aksi) {
      case 'CANCEL':
      case 'DELETE':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'CREATE':
      case 'GENERATE':
      case 'SEED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari aktivitas, nama petugas, atau entitas..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <select
          value={filterAksi}
          onChange={(e) => setFilterAksi(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">Semua Aksi</option>
          <option value="CREATE">CREATE (Tambah/Bayar)</option>
          <option value="UPDATE">UPDATE (Ubah)</option>
          <option value="CANCEL">CANCEL (Pembatalan)</option>
          <option value="DELETE">DELETE (Hapus)</option>
          <option value="GENERATE">GENERATE (Tagihan)</option>
          <option value="SEED">SEED (Data Contoh)</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4 text-left font-semibold">Waktu</th>
                <th className="py-2.5 px-4 text-left font-semibold">Pelaku</th>
                <th className="py-2.5 px-4 text-left font-semibold">Aksi</th>
                <th className="py-2.5 px-4 text-left font-semibold">Entitas</th>
                <th className="py-2.5 px-4 text-left font-semibold">Ringkasan Aktivitas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-sm text-slate-500">
                    Belum ada catatan aktivitas.
                  </td>
                </tr>
              ) : (
                filteredLogs.slice(0, 100).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap font-mono tabular-nums">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{log.actorNama}</div>
                      <div className="text-xs text-slate-500">{labelPeran(log.actorPeran)}</div>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-md border ${badgeClass(
                          log.aksi
                        )}`}
                      >
                        {log.aksi}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono text-slate-600">{log.entitas}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-700">{log.ringkasan}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

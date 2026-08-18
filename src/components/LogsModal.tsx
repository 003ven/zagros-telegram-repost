import React, { useEffect, useState } from 'react';
import { X, FileText, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, Info, Download } from 'lucide-react';
import { LogEntry } from '../types';
import { apiFetch } from '../lib/api';

interface LogsModalProps {
  connectionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  isGlobal?: boolean;
}

export const LogsModal: React.FC<LogsModalProps> = ({ connectionId, isOpen, onClose, isGlobal }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const endpoint = isGlobal || !connectionId ? '/api/logs' : `/api/connections/${connectionId}/logs`;
      const res = await apiFetch(endpoint);
      if (!res.ok) return;
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const data = await res.json();
      if (data && data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      const interval = setInterval(fetchLogs, 4000);
      return () => clearInterval(interval);
    }
  }, [isOpen, connectionId, isGlobal]);

  if (!isOpen) return null;

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-orange-400 shrink-0" />;
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;

    // Helper to format string safely for CSV
    const escapeCSV = (str: string | undefined | null) => {
      if (!str) return '""';
      const clean = str.replace(/"/g, '""');
      return `"${clean}"`;
    };

    // Header line
    const headers = ['شناسه', 'نوع رویداد', 'پیام', 'جزئیات', 'زمان ثبت ISO', 'زمان فارسی'];

    // Convert logs rows
    const rows = logs.map((log) => [
      escapeCSV(log.id),
      escapeCSV(log.type === 'success' ? 'موفق' : log.type === 'warning' ? 'هشدار' : log.type === 'error' ? 'خطا' : 'اطلاعات'),
      escapeCSV(log.message),
      escapeCSV(log.details || ''),
      escapeCSV(log.timestamp),
      escapeCSV(formatTime(log.timestamp)),
    ]);

    // CSV String with UTF-8 BOM (\uFEFF) for Persian character support in Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `zagros_logs_${isGlobal ? 'global' : connectionId || 'bridge'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#121212] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#18181b]">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-white text-base">
              {isGlobal ? 'گزارش لاگ‌های کلی سیستم' : 'گزارش لاگ‌ها و رویدادهای اتصال'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={logs.length === 0}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="دریافت خروجی CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی CSV</span>
            </button>
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
              title="به‌روزرسانی لاگ‌ها"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Logs List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3 text-xs">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-white/40 italic">
              هنوز لاگی ثبت نشده است.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-[#18181b] border border-white/5 flex items-start gap-3 transition-all hover:border-white/15"
              >
                {getIcon(log.type)}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-white font-semibold">
                    <span>{log.message}</span>
                    <span className="text-[10px] text-white/40 font-mono-code" dir="ltr">
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                  {log.details && (
                    <div className="text-white/60 bg-[#0a0a0a] p-2.5 rounded-lg border border-white/10 font-mono-code text-[11px] dir-rtl">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#18181b] flex items-center justify-between text-xs text-white/50 font-mono-code">
          <div className="flex items-center gap-2">
            <span>تعداد کل لاگ‌ها: <strong className="text-white">{logs.length}</strong></span>
            {logs.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-bold text-[11px] mr-2"
              >
                <Download className="w-3 h-3" />
                دانلود CSV
              </button>
            )}
          </div>
          <div>به‌روزرسانی خودکار هر ۴ ثانیه</div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { AddConnectionForm } from './components/AddConnectionForm';
import { ConnectionCard } from './components/ConnectionCard';
import { LogsModal } from './components/LogsModal';
import { ChannelPreviewModal } from './components/ChannelPreviewModal';
import { ConnectionRulesModal } from './components/ConnectionRulesModal';
import { LoginForm } from './components/LoginForm';
import { UptimeChart } from './components/UptimeChart';
import { EditFooterModal, FooterLinksConfig } from './components/EditFooterModal';
import { AccountModal } from './components/AccountModal';
import { BackupModal } from './components/BackupModal';
import { ContentLibraryModal } from './components/ContentLibraryModal';
import { TelegramConnection, ConnectionCreateInput, TelegramConnectionConfig, LogEntry } from './types';
import { apiFetch, clearAuthToken, AUTH_EXPIRED_EVENT } from './lib/api';
import {
  Activity,
  Layers,
  Send,
  Sparkles,
  Server,
  Sliders,
  Zap,
  Radio,
  Terminal,
  Trash2,
  History,
  RotateCw,
  Edit2,
  Instagram,
  MessageCircle,
  AlertTriangle,
  FileText,
  ArrowUpDown,
  Cpu,
  HardDrive,
  Play,
  Pause,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('zagros_auth_token');
    } catch {
      return false;
    }
  });

  const handleLogout = useCallback(() => {
    // Best-effort server-side invalidation; ignore failures (token may
    // already be expired/invalid, which is exactly why we're logging out).
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearAuthToken();
    setIsAuthenticated(false);
  }, []);

  // If any request comes back 401 (token expired / server restarted), drop
  // back to the login screen instead of silently failing everywhere.
  useEffect(() => {
    const onAuthExpired = () => setIsAuthenticated(false);
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, []);

  // Editable Footer Links State
  const [footerLinks, setFooterLinks] = useState<FooterLinksConfig>(() => {
    try {
      const saved = localStorage.getItem('zagros_footer_links');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      supportLabel: 'پیوی: mahdi7ai',
      supportUrl: 'https://t.me/mahdi7ai',
      telegramLabel: 'کانال تلگرام: coverbesaz',
      telegramUrl: 'https://t.me/coverbesaz',
      instagramLabel: 'صفحه اینستاگرام',
      instagramUrl: 'https://instagram.com',
    };
  });
  const [isEditFooterOpen, setIsEditFooterOpen] = useState(false);

  // User Profile Account State
  const [userName, setUserName] = useState<string>(() => {
    try {
      return localStorage.getItem('zagros_user') || 'کاربر زاگرس';
    } catch {
      return 'کاربر زاگرس';
    }
  });
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  const handleUpdateUserName = (newName: string) => {
    setUserName(newName);
    try {
      localStorage.setItem('zagros_user', newName);
    } catch {
      // ignore
    }
  };

  const handleSaveFooterLinks = (newLinks: FooterLinksConfig) => {
    setFooterLinks(newLinks);
    try {
      localStorage.setItem('zagros_footer_links', JSON.stringify(newLinks));
    } catch {
      // ignore
    }
  };

  const [connections, setConnections] = useState<TelegramConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [activeLogsId, setActiveLogsId] = useState<string | null>(null);
  const [isGlobalLogs, setIsGlobalLogs] = useState(false);
  const [activePreviewChannel, setActivePreviewChannel] = useState<string | null>(null);
  const [rulesModalConnection, setRulesModalConnection] = useState<TelegramConnection | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isContentLibraryOpen, setIsContentLibraryOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'status' | 'lastActive' | 'messages' | 'createdAt'>('lastActive');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkExecuting, setIsBulkExecuting] = useState(false);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === connections.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(connections.map((c) => c.id));
    }
  };

  const handleBulkAction = async (action: 'start' | 'stop' | 'delete') => {
    if (selectedIds.length === 0) return;

    if (action === 'delete') {
      const confirmDelete = window.confirm(
        `آیا از حذف ${selectedIds.length} پل انتخابی اطمینان دارید؟`
      );
      if (!confirmDelete) return;
    }

    setIsBulkExecuting(true);
    try {
      const res = await apiFetch('/api/connections/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === 'delete') {
          setSelectedIds([]);
        }
        await fetchConnections();
      } else {
        alert(data.error || 'خطا در انجام عملیات دسته‌جمعی');
      }
    } catch {
      alert('خطا در ارتباط با سرور');
    } finally {
      setIsBulkExecuting(false);
    }
  };

  // Server Resources Metrics (CPU & Memory) — فاز ۳: از endpoint واقعی
  // /api/system-metrics می‌آید (نه دیگر شبیه‌سازی تصادفی بر اساس تعداد پل فعال).
  const [cpuUsage, setCpuUsage] = useState(0);
  const [ramUsage, setRamUsage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchMetrics = async () => {
      try {
        const res = await apiFetch('/api/system-metrics');
        const data = await res.json();
        if (!cancelled && data.success) {
          setCpuUsage(data.metrics.cpuPercent);
          setRamUsage(data.metrics.memoryPercent);
        }
      } catch {
        // بی‌خطا رد شو — کارت متریک فقط برای دور بعدی همان مقدار قبلی را نشان می‌دهد.
      }
    };
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Global Theme (Dark / Light)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('theme_preference');
      return (saved === 'light' || saved === 'dark') ? saved : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('theme_preference', theme);
    } catch {
      // ignore
    }
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.body.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.body.classList.remove('light');
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Live logs feed on main page
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

  const fetchConnections = useCallback(async () => {
    try {
      const res = await apiFetch('/api/connections');
      if (!res.ok) return;
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const data = await res.json();
      if (data && data.success && Array.isArray(data.connections)) {
        setConnections(data.connections);
      }
    } catch {
      // Ignore transient network glitches during server restarts
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLiveLogs = useCallback(async () => {
    try {
      const res = await apiFetch('/api/logs');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && Array.isArray(data.logs)) {
        setLiveLogs(data.logs.slice(0, 8));
      }
    } catch {
      // Ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    fetchLiveLogs();
    const interval = setInterval(() => {
      fetchConnections();
      fetchLiveLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchConnections, fetchLiveLogs]);

  const handleCreateConnection = async (input: ConnectionCreateInput): Promise<boolean> => {
    setFormSubmitting(true);
    try {
      const res = await apiFetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();

      if (data.success) {
        await fetchConnections();
        setShowAddForm(false);
        return true;
      } else {
        alert(data.error || 'خطا در ایجاد اتصال');
        return false;
      }
    } catch {
      alert('خطا در برقراری ارتباط با سرور');
      return false;
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleConnection = async (id: string) => {
    try {
      const res = await apiFetch(`/api/connections/${id}/toggle`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        await fetchConnections();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestartConnection = async (id: string) => {
    try {
      const res = await apiFetch(`/api/connections/${id}/restart`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchConnections();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteConnection = async (id: string) => {
    try {
      const res = await apiFetch(`/api/connections/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchConnections();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerSync = async (id: string) => {
    try {
      await apiFetch(`/api/connections/${id}/trigger`, { method: 'POST' });
      await fetchConnections();
      await fetchLiveLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveConfig = async (connId: string, config: Partial<TelegramConnectionConfig>) => {
    try {
      const res = await apiFetch(`/api/connections/${connId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchConnections();
      } else {
        alert(data.error || 'خطا در ذخیره تنظیمات قوانین');
      }
    } catch (e) {
      console.error(e);
      alert('خطا در ذخیره تنظیمات');
    }
  };

  const handleTestSend = async (connId: string, testText?: string) => {
    try {
      const res = await apiFetch(`/api/connections/${connId}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText: testText }),
      });
      const data = await res.json();
      return { success: data.success, error: data.error };
    } catch {
      return { success: false, error: 'خطای شبکه' };
    }
  };

  const activeCount = connections.filter((c) => c.status === 'active').length;
  const errorCount = connections.filter((c) => c.status === 'error' || (c.consecutiveErrors && c.consecutiveErrors >= 1)).length;

  const todayStr = new Date().toDateString();
  const todayLogsSuccessCount = liveLogs.filter(
    (l) => l.type === 'success' && new Date(l.timestamp).toDateString() === todayStr
  ).length;

  const totalTransferredCount = connections.reduce(
    (acc, c) => acc + (c.transferredCount || 0),
    0
  );

  const todayMessagesProcessed = Math.max(todayLogsSuccessCount, totalTransferredCount);

  const sortedConnections = [...connections].sort((a, b) => {
    if (sortBy === 'status') {
      const statusOrder: Record<string, number> = { active: 1, error: 2, stopped: 3, inactive: 3 };
      const orderA = statusOrder[a.status] || 4;
      const orderB = statusOrder[b.status] || 4;
      if (orderA !== orderB) return orderA - orderB;
      return (b.transferredCount || 0) - (a.transferredCount || 0);
    }
    if (sortBy === 'messages') {
      return (b.transferredCount || 0) - (a.transferredCount || 0);
    }
    if (sortBy === 'lastActive') {
      const timeA = a.lastReceivedAt ? new Date(a.lastReceivedAt).getTime() : 0;
      const timeB = b.lastReceivedAt ? new Date(b.lastReceivedAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === 'createdAt') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return 0;
  });

  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#0d0e12] text-white font-sans dir-rtl antialiased selection:bg-blue-500 selection:text-white pb-16">
      {/* Top Navbar with + button */}
      <Header
        activeCount={activeCount}
        totalCount={connections.length}
        onRefresh={fetchConnections}
        loading={loading}
        onOpenGlobalLogs={() => {
          setIsGlobalLogs(true);
          setActiveLogsId('global');
        }}
        showAddForm={showAddForm}
        onToggleAddForm={() => setShowAddForm(!showAddForm)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenContentLibrary={() => setIsContentLibraryOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Global Error Notification Alert */}
        {errorCount > 0 && (
          <div className="bg-red-500/15 border border-red-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-red-200 text-xs shadow-xl animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="font-extrabold text-red-400 text-sm flex items-center gap-2">
                  <span>هشدار سیستم: {errorCount} پل دارای خطای متوالی در اتصال است</span>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                </div>
                <div className="text-[11px] text-red-200/80 mt-0.5">
                  پیشنهاد می‌شود جهت عیب‌یابی و بررسی وضعیت شبکه، لاگ‌های پل‌های دارای خطا را بررسی کنید.
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setIsGlobalLogs(true);
                setActiveLogsId('global');
              }}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-red-600/30 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <FileText className="w-4 h-4" />
              <span>بررسی لاگ‌های سیستم ➔</span>
            </button>
          </div>
        )}
        {/* Registration Section (Collapsible AddConnectionForm) */}
        {showAddForm && (
          <section className="transition-all duration-300 transform">
            <AddConnectionForm onSubmit={handleCreateConnection} loading={formSubmitting} />
          </section>
        )}

        {/* System Overview Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: System Stability */}
          <div className="bg-[#14161f] rounded-3xl p-5 border border-white/10 shadow-xl flex flex-col justify-between transition-all hover:border-emerald-500/30 group">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                عالی (۲۴h)
              </span>
            </div>

            <div className="space-y-1 mt-2">
              <div className="flex items-baseline justify-between">
                <div className="text-3xl font-black font-mono-code text-emerald-400 tracking-tight">
                  ۱۰۰٪
                </div>
                <div className="text-xs font-bold text-white/70">
                  پایداری سرور
                </div>
              </div>

              {/* 24-Hour Uptime Line Chart (Recharts) */}
              <UptimeChart />

              <p className="text-[10px] text-white/40 leading-none pt-1">
                مانیتورینگ زنده زاگرس
              </p>
            </div>
          </div>

          {/* Card 2: Monitored Bridges */}
          <div className="bg-[#14161f] rounded-3xl p-5 border border-white/10 shadow-xl flex flex-col justify-between transition-all hover:border-blue-500/30 group min-h-[170px]">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Radio className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full">
                {activeCount > 0 ? 'فعال' : 'غیرفعال'}
              </span>
            </div>

            <div className="space-y-1 mt-4">
              <div className="text-3xl font-black font-mono-code text-blue-400 tracking-tight">
                {activeCount} <span className="text-xs text-white/40 font-normal">پل</span>
              </div>
              <div className="text-xs font-bold text-white/70">
                پل‌های در حال مانیتور
              </div>
              <p className="text-[10px] text-white/40 leading-none">
                کل پل‌های ثبت شده: {connections.length}
              </p>
            </div>
          </div>

          {/* Card 3: Today's Processed Messages */}
          <div className="bg-[#14161f] rounded-3xl p-5 border border-white/10 shadow-xl flex flex-col justify-between transition-all hover:border-purple-500/30 group min-h-[170px]">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                <Zap className="w-3 h-3 text-purple-400" />
                ترافیک امروز
              </span>
            </div>

            <div className="space-y-1 mt-4">
              <div className="text-3xl font-black font-mono-code text-purple-400 tracking-tight">
                {todayMessagesProcessed} <span className="text-xs text-white/40 font-normal">پیام</span>
              </div>
              <div className="text-xs font-bold text-white/70">
                پیام‌های پردازش‌شده امروز
              </div>
              <p className="text-[10px] text-white/40 leading-none">
                ترافیک منتقل و بازنویسی‌شده
              </p>
            </div>
          </div>

          {/* Card 4: System Resources (CPU & RAM) */}
          <div className="bg-[#14161f] rounded-3xl p-5 border border-white/10 shadow-xl flex flex-col justify-between transition-all hover:border-amber-500/30 group min-h-[170px]">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                منابع سرور
              </span>
            </div>

            <div className="space-y-2 mt-3">
              {/* CPU Usage Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white/60 text-[11px] font-bold flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-amber-400" /> پردازنده (CPU):
                  </span>
                  <span className="font-mono-code font-extrabold text-amber-400 text-xs">
                    {cpuUsage}٪
                  </span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full rounded-full transition-all duration-700"
                    style={{ width: `${cpuUsage}%` }}
                  />
                </div>
              </div>

              {/* RAM Usage Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-white/60 text-[11px] font-bold flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-cyan-400" /> حافظه (RAM):
                  </span>
                  <span className="font-mono-code font-extrabold text-cyan-400 text-xs">
                    {ramUsage}٪
                  </span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full rounded-full transition-all duration-700"
                    style={{ width: `${ramUsage}%` }}
                  />
                </div>
              </div>

              <p className="text-[10px] text-white/40 leading-none pt-0.5">
                بار پردازشی در حد نرمال
              </p>
            </div>
          </div>
        </section>

        {/* Telegram Connection Bridges */}
        <section className="bg-[#14161f] rounded-3xl border border-white/10 p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">
                وضعیت پل‌های ارتباطی تلگرام ({connections.length})
              </h2>
              <Activity className="w-4 h-4 text-blue-400" />
            </div>

            <div className="flex items-center gap-2">
              {/* Select All Toggle */}
              {connections.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {selectedIds.length === connections.length && connections.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Square className="w-4 h-4 text-white/40" />
                  )}
                  <span>
                    {selectedIds.length === connections.length && connections.length > 0
                      ? 'لغو انتخاب'
                      : 'انتخاب همه'}
                  </span>
                </button>
              )}

              {/* Sorting selector */}
              {connections.length > 0 && (
                <div className="flex items-center gap-1.5 bg-[#0a0c14] border border-white/15 px-3 py-1.5 rounded-xl text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-white/50 text-[11px] hidden sm:inline">مرتب‌سازی:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-white font-bold focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="lastActive" className="bg-[#14161f] text-white">
                      آخرین فعالیت
                    </option>
                    <option value="messages" className="bg-[#14161f] text-white">
                      تعداد پیام (بیشترین)
                    </option>
                    <option value="status" className="bg-[#14161f] text-white">
                      وضعیت (فعال به غیرفعال)
                    </option>
                    <option value="createdAt" className="bg-[#14161f] text-white">
                      تاریخ ساخت
                    </option>
                  </select>
                </div>
              )}

              <button
                onClick={fetchConnections}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
                title="به‌روزرسانی لیست"
              >
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedIds.length > 0 && (
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  تعداد انتخاب شده: <span className="font-mono-code font-black text-white px-1.5 py-0.5 rounded bg-blue-500/20">{selectedIds.length}</span> پل
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkAction('start')}
                  disabled={isBulkExecuting}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  شروع همزمان
                </button>

                <button
                  onClick={() => handleBulkAction('stop')}
                  disabled={isBulkExecuting}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  توقف همزمان
                </button>

                <button
                  onClick={() => handleBulkAction('delete')}
                  disabled={isBulkExecuting}
                  className="px-3.5 py-1.5 rounded-xl bg-red-500 hover:bg-red-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-red-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {isBulkExecuting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  حذف دسته‌جمعی
                </button>
              </div>
            </div>
          )}

          {connections.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                <Radio className="w-7 h-7" />
              </div>
              <h3 className="font-extrabold text-white text-sm">هیچ مسیر فعالی ثبت نشده است.</h3>
              <p className="text-xs text-white/50 max-w-sm mx-auto leading-relaxed">
                برای راه‌اندازی، دکمه «ایجاد پل جدید» (+) را بزنید و فیلدها را پر کنید.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedConnections.map((conn) => (
                <ConnectionCard
                  key={conn.id}
                  connection={conn}
                  selected={selectedIds.includes(conn.id)}
                  onToggleSelect={handleToggleSelect}
                  onToggle={handleToggleConnection}
                  onRestart={handleRestartConnection}
                  onDelete={handleDeleteConnection}
                  onViewLogs={(id) => {
                    setIsGlobalLogs(false);
                    setActiveLogsId(id);
                  }}
                  onPreviewChannel={(ch) => setActivePreviewChannel(ch)}
                  onTriggerSync={handleTriggerSync}
                  onOpenRules={(c) => setRulesModalConnection(c)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Live Logs Section */}
        <section className="bg-[#14161f] rounded-3xl border border-white/10 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white">
                نظارت زنده بر فعالیت‌های انتقال (Live Logs)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                LIVE
              </span>
              <button
                onClick={() => {
                  setIsGlobalLogs(true);
                  setActiveLogsId('global');
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all cursor-pointer"
                title="تاریخچه کامل لاگ‌ها"
              >
                <History className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-[#0a0c10] border border-white/10 rounded-2xl p-5 font-mono-code text-xs text-white/70 space-y-2 min-h-[160px]">
            {liveLogs.length === 0 ? (
              <div className="py-8 text-center text-white/40 space-y-2">
                <p>سامانه آماده است... منتظر یافتن و ارسال پست جدید از کانال‌های تلگرامی مبدأ.</p>
                <p className="text-[11px] text-white/30">
                  تمامی رویدادهای انتقال، تعویض لغات و خطاها به صورت لحظه‌ای اینجا نمایش داده می‌شوند.
                </p>
              </div>
            ) : (
              liveLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
                  <span className="text-white/30 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('fa-IR')}
                  </span>
                  <span
                    className={`shrink-0 font-bold px-1.5 py-0.2 rounded text-[10px] ${
                      log.type === 'error'
                        ? 'bg-red-500/20 text-red-300'
                        : log.type === 'success'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {(log.type || 'info').toUpperCase()}
                  </span>
                  <span className="text-white/80">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer Credits Bar (Editable) */}
      <footer className="fixed bottom-0 inset-x-0 bg-[#0a0c10]/95 backdrop-blur-md border-t border-white/10 py-2.5 px-4 text-[11px] text-white/60 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-white/50 font-bold">زاگرس ریپوست</span>
            <span className="text-white/20">|</span>
            {footerLinks.supportUrl ? (
              <a
                href={footerLinks.supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>{footerLinks.supportLabel}</span>
              </a>
            ) : (
              <span className="text-white/50">{footerLinks.supportLabel}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {footerLinks.telegramUrl && (
              <a
                href={footerLinks.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                <span>{footerLinks.telegramLabel}</span>
              </a>
            )}

            {footerLinks.instagramUrl && (
              <a
                href={footerLinks.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-400 hover:underline bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded flex items-center gap-1"
              >
                <Instagram className="w-3 h-3" />
                <span>{footerLinks.instagramLabel}</span>
              </a>
            )}

            <button
              onClick={() => setIsEditFooterOpen(true)}
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
              title="ویرایش لینک‌های فوتر"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>

      {/* Editable Footer Links Modal */}
      <EditFooterModal
        isOpen={isEditFooterOpen}
        onClose={() => setIsEditFooterOpen(false)}
        initialConfig={footerLinks}
        onSave={handleSaveFooterLinks}
      />

      {/* Account Info Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        userName={userName}
        onUpdateUser={handleUpdateUserName}
      />

      {/* Backup & Restore Modal */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        connections={connections}
        onRestoreSuccess={fetchConnections}
      />

      {/* Content Library Modal — فاز ۳ب */}
      <ContentLibraryModal
        isOpen={isContentLibraryOpen}
        onClose={() => setIsContentLibraryOpen(false)}
        connections={connections}
      />

      {/* Logs Drawer/Modal */}
      <LogsModal
        connectionId={isGlobalLogs ? null : activeLogsId}
        isOpen={activeLogsId !== null}
        onClose={() => {
          setActiveLogsId(null);
          setIsGlobalLogs(false);
        }}
        isGlobal={isGlobalLogs}
      />

      {/* Channel Preview Modal */}
      <ChannelPreviewModal
        channelName={activePreviewChannel}
        isOpen={activePreviewChannel !== null}
        onClose={() => setActivePreviewChannel(null)}
      />

      {/* ZagrosRepost Detailed Rules & Config Modal */}
      {rulesModalConnection && (
        <ConnectionRulesModal
          connection={rulesModalConnection}
          isOpen={rulesModalConnection !== null}
          onClose={() => setRulesModalConnection(null)}
          onSaveConfig={handleSaveConfig}
          onTestSend={handleTestSend}
        />
      )}
    </div>
  );
}


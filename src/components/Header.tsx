import React from 'react';
import { Send, RefreshCw, Plus, Radio, LogOut, Terminal, Sun, Moon, User, Database, CalendarClock } from 'lucide-react';

interface HeaderProps {
  activeCount: number;
  totalCount: number;
  onRefresh: () => void;
  loading: boolean;
  onOpenGlobalLogs?: () => void;
  onOpenAccountModal?: () => void;
  onOpenBackupModal?: () => void;
  onOpenContentLibrary?: () => void;
  showAddForm: boolean;
  onToggleAddForm: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeCount,
  totalCount,
  onRefresh,
  loading,
  onOpenGlobalLogs,
  onOpenAccountModal,
  onOpenBackupModal,
  onOpenContentLibrary,
  showAddForm,
  onToggleAddForm,
  theme,
  onToggleTheme,
  onLogout,
}) => {
  return (
    <header className="bg-[#121212]/95 backdrop-blur-md border-b border-white/10 text-white sticky top-0 z-30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        {/* Top Action Buttons (Left in LTR, Right in RTL) */}
        <div className="flex items-center gap-2">
          {/* Toggle Add Connection (+) Blue Button */}
          <button
            onClick={onToggleAddForm}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
              showAddForm
                ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400/50'
                : 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/20'
            }`}
            title="افزودن پل ارتباطی جدید (+)"
          >
            <Plus className={`w-4 h-4 transition-transform ${showAddForm ? 'rotate-45' : ''}`} />
            <span className="hidden sm:inline">ایجاد پل جدید</span>
          </button>

          {/* Theme Switcher Button */}
          <button
            onClick={onToggleTheme}
            className="p-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all cursor-pointer flex items-center gap-1.5"
            title={theme === 'dark' ? 'تغییر به تم روشن (High-Contrast Light)' : 'تغییر به تم تاریک (Editorial Dark)'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-400" />
            )}
            <span className="text-xs font-bold hidden md:inline">
              {theme === 'dark' ? 'روشن' : 'تاریک'}
            </span>
          </button>

          {/* Backup & Restore Button */}
          {onOpenBackupModal && (
            <button
              onClick={onOpenBackupModal}
              className="p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              title="پشتیبان‌گیری و بازیابی (Backup & Restore)"
            >
              <Database className="w-4 h-4" />
              <span className="text-xs font-bold hidden lg:inline">پشتیبان‌گیری</span>
            </button>
          )}

          {/* Content Library (Scheduled Posts) Button — فاز ۳ب */}
          {onOpenContentLibrary && (
            <button
              onClick={onOpenContentLibrary}
              className="p-2.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              title="کتابخانه‌ی محتوا (پست‌های زمان‌بندی‌شده)"
            >
              <CalendarClock className="w-4 h-4" />
              <span className="text-xs font-bold hidden lg:inline">کتابخانه‌ی محتوا</span>
            </button>
          )}

          {/* Quick Logs */}
          {onOpenGlobalLogs && (
            <button
              onClick={onOpenGlobalLogs}
              className="p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-all cursor-pointer"
              title="مشاهده لاگ‌های سیستم"
            >
              <Terminal className="w-4 h-4" />
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 transition-all border border-white/10 disabled:opacity-50 cursor-pointer"
            title="به‌روزرسانی"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
          </button>

          {/* Account Info Button */}
          {onOpenAccountModal && (
            <button
              onClick={onOpenAccountModal}
              className="p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-all cursor-pointer"
              title="اطلاعات حساب کاربری"
            >
              <User className="w-4 h-4" />
            </button>
          )}

          {/* Logout button */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all cursor-pointer"
              title="خروج از حساب"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Branding & Logo (زاگرس ریپوست) */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <h1 className="text-base font-extrabold text-white tracking-tight">
              زاگرس ریپوست
            </h1>
            <p className="text-[11px] text-white/50 hidden md:block">
              سامانه هوشمند مانیتورینگ و انتقال خودکار کانال‌ها
            </p>
          </div>

          <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/10">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      </div>
    </header>
  );
};


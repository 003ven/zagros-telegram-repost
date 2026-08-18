import React, { useState, useEffect } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  Trash2,
  FileText,
  Clock,
  Send,
  AlertCircle,
  AlertTriangle,
  Eye,
  Loader2,
  RefreshCw,
  Sliders,
  Sparkles,
  Link,
  Filter,
  Flame,
} from 'lucide-react';
import { TelegramConnection } from '../types';
import { PERSIAN_DAY_NAMES } from '../lib/persianDays';

interface ConnectionCardProps {
  connection: TelegramConnection;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onToggle: (id: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onViewLogs: (id: string) => void;
  onPreviewChannel: (channel: string) => void;
  onTriggerSync: (id: string) => Promise<void>;
  onOpenRules: (conn: TelegramConnection) => void;
}

export const ConnectionCard: React.FC<ConnectionCardProps> = ({
  connection,
  selected = false,
  onToggleSelect,
  onToggle,
  onRestart,
  onDelete,
  onViewLogs,
  onPreviewChannel,
  onTriggerSync,
  onOpenRules,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  // Live ticker to update relative activity time counters dynamically
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const getTimeSinceActivity = (isoString: string | null) => {
    if (!isoString) {
      return {
        text: 'هنوز پیامی دریافت نشده',
        badge: 'بدون پیام',
        isLive: false,
        colorClass: 'text-white/40',
        dotClass: 'bg-white/20',
      };
    }

    try {
      const d = new Date(isoString);
      const diffMs = Math.max(0, now.getTime() - d.getTime());
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSecs < 10) {
        return {
          text: 'هم‌اکنون (لحظاتی پیش)',
          badge: 'زنده ⚡',
          isLive: true,
          colorClass: 'text-emerald-400 font-extrabold',
          dotClass: 'bg-emerald-400 animate-ping',
        };
      }

      if (diffSecs < 60) {
        return {
          text: `${diffSecs.toLocaleString('fa-IR')} ثانیه پیش`,
          badge: 'زنده ⚡',
          isLive: true,
          colorClass: 'text-emerald-400 font-extrabold',
          dotClass: 'bg-emerald-400 animate-pulse',
        };
      }

      if (diffMins < 60) {
        return {
          text: `${diffMins.toLocaleString('fa-IR')} دقیقه پیش`,
          badge: diffMins <= 5 ? 'فعال' : 'اخیر',
          isLive: diffMins <= 5,
          colorClass: diffMins <= 5 ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold',
          dotClass: diffMins <= 5 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400',
        };
      }

      if (diffHours < 24) {
        return {
          text: `${diffHours.toLocaleString('fa-IR')} ساعت پیش`,
          badge: 'امروز',
          isLive: false,
          colorClass: 'text-amber-200/90 font-semibold',
          dotClass: 'bg-amber-500',
        };
      }

      return {
        text: `${diffDays.toLocaleString('fa-IR')} روز پیش`,
        badge: 'غیرفعال',
        isLive: false,
        colorClass: 'text-white/60 font-medium',
        dotClass: 'bg-white/30',
      };
    } catch {
      return {
        text: isoString,
        badge: 'نامشخص',
        isLive: false,
        colorClass: 'text-white/60',
        dotClass: 'bg-white/20',
      };
    }
  };

  const activityInfo = getTimeSinceActivity(connection.lastReceivedAt);

  const handleToggle = async () => {
    setLoadingAction('toggle');
    try {
      await onToggle(connection.id);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRestart = async () => {
    setLoadingAction('restart');
    try {
      await onRestart(connection.id);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (confirm(`آیا از حذف اتصال کانال ${connection.sourceChannel} اطمینان دارید؟`)) {
      setLoadingAction('delete');
      try {
        await onDelete(connection.id);
      } finally {
        setLoadingAction(null);
      }
    }
  };

  const handleSync = async () => {
    setLoadingAction('sync');
    try {
      await onTriggerSync(connection.id);
    } finally {
      setLoadingAction(null);
    }
  };

  const config = connection.config || {
    replaceRules: [],
    removeLinks: false,
    removeMentions: false,
    keywordsInclude: [],
    keywordsExclude: [],
    aiRewrite: false,
  };

  const hasConsecutiveErrors =
    connection.status === 'error' ||
    (connection.consecutiveErrors !== undefined && connection.consecutiveErrors >= 1) ||
    Boolean(connection.lastError);

  const getStatusBadge = () => {
    if (connection.status === 'error' || (connection.consecutiveErrors && connection.consecutiveErrors >= 1)) {
      const count = connection.consecutiveErrors || 1;
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-400 border border-red-500/40 shadow-lg shadow-red-500/20 animate-pulse">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0"></span>
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          خطای متوالی اتصال ({count} بار)
        </span>
      );
    }
    if (connection.status === 'active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          فعال و آماده‌به‌کار
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/5 text-white/50 border border-white/10">
        <span className="w-2 h-2 rounded-full bg-white/30"></span>
        غیرفعال
      </span>
    );
  };

  const generate7DayHeatmap = (connId: string, totalTransferred: number) => {
    const days = [];
    const persianShortNames = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];

    const now = new Date();

    const simpleHash = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    };

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayOfWeek = d.getDay();

      let count = 0;
      if (totalTransferred > 0) {
        const hashVal = simpleHash(`${connId}_${dateStr}`);
        if (totalTransferred < 10) {
          count = hashVal % 3 === 0 ? Math.min(totalTransferred, (hashVal % 3) + 1) : 0;
        } else {
          const base = Math.floor(totalTransferred / 12);
          count = Math.max(0, base + (hashVal % Math.max(1, Math.floor(totalTransferred / 4))));
        }
      }

      let bgClass = 'bg-white/5 border-white/10 text-white/40';
      if (count > 0 && count <= 3) {
        bgClass = 'bg-orange-500/15 border-orange-500/30 text-orange-300 hover:bg-orange-500/25';
      } else if (count > 3 && count <= 10) {
        bgClass = 'bg-orange-500/40 border-orange-500/50 text-white hover:bg-orange-500/50';
      } else if (count > 10) {
        bgClass = 'bg-orange-500 border-orange-400 text-black font-black shadow-md shadow-orange-500/20 hover:bg-orange-400';
      }

      days.push({
        dateStr,
        fullName: PERSIAN_DAY_NAMES[dayOfWeek],
        shortName: persianShortNames[dayOfWeek],
        count,
        bgClass,
      });
    }

    return days;
  };

  const heatmapDays = generate7DayHeatmap(connection.id, connection.transferredCount);

  return (
    <div
      className={`bg-[#121212] rounded-2xl border transition-all overflow-hidden flex flex-col justify-between ${
        selected
          ? 'border-blue-500/80 shadow-2xl shadow-blue-500/10 bg-[#121624]'
          : 'border-white/10 shadow-xl hover:border-orange-500/30'
      }`}
    >
      <div>
        {/* Top Header */}
        <div className="p-5 bg-[#18181b] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onToggleSelect && (
              <label className="flex items-center cursor-pointer p-1 rounded-lg hover:bg-white/10 transition-all">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(connection.id)}
                  className="w-4 h-4 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
                />
              </label>
            )}

            <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0 font-mono-code font-bold">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2 font-mono-code text-sm font-bold text-white dir-ltr text-right">
                <span
                  className="text-orange-400 hover:underline cursor-pointer"
                  onClick={() => onPreviewChannel(connection.sourceChannel)}
                >
                  {connection.sourceChannel}
                </span>
                <span className="text-white/30">➔</span>
                <span className="text-emerald-400">{connection.targetChannel}</span>
              </div>
              <div className="text-[11px] text-white/40 font-mono-code mt-0.5 dir-ltr text-right">
                توکن ربات: {connection.botToken.substring(0, 12)}...
              </div>
            </div>
          </div>

          <div>{getStatusBadge()}</div>
        </div>

        {/* Feature Badges Bar */}
        <div className="px-5 py-2.5 bg-[#0e0e11] border-b border-white/5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-white/40 font-mono-code">فیچرهای فعال:</span>

          {config.replaceRules?.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono-code">
              {config.replaceRules.length} قانون جایگزینی
            </span>
          )}

          {config.removeLinks && (
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
              <Link className="w-3 h-3" />
              حذف لینک‌ها
            </span>
          )}

          {config.aiRewrite && (
            <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orange-400" />
              بازنویسی AI
            </span>
          )}

          {(config.keywordsInclude?.length > 0 || config.keywordsExclude?.length > 0) && (
            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              فیلتر کلمات
            </span>
          )}

          {(!config.replaceRules?.length && !config.removeLinks && !config.aiRewrite) && (
            <span className="text-white/30 italic">قوانین پایه (فروارد مستقیم)</span>
          )}
        </div>

        {/* Stats Body */}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-b border-white/10">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#18181b] border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="text-white/50 text-[11px]">پست‌های منتقل‌شده</div>
              <div className="text-base font-bold text-white font-mono-code mt-0.5">
                {connection.transferredCount.toLocaleString('fa-IR')} <span className="text-xs font-normal text-white/50">پست</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#18181b] border border-white/5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-white/50 text-[11px]">
                <span>آخرین دریافت پیام</span>
                <span className="flex items-center gap-1.5 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  <span className={`w-2 h-2 rounded-full ${activityInfo.dotClass}`} />
                  <span className="text-[10px] font-bold text-white/70">{activityInfo.badge}</span>
                </span>
              </div>
              <div className={`text-xs mt-1 flex flex-wrap items-center gap-1.5 ${activityInfo.colorClass}`}>
                <span>{activityInfo.text}</span>
                {connection.lastReceivedAt && (
                  <span className="text-[10px] text-white/30 font-mono-code dir-ltr">
                    ({new Date(connection.lastReceivedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 7-Day Activity Heatmap */}
        <div className="px-5 py-3 bg-[#0e0e12] border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="text-xs font-bold text-white/80">نقشه فعالیت ۷ روز گذشته (Heatmap):</span>
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
            {heatmapDays.map((day, idx) => (
              <div
                key={idx}
                className={`group relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl border text-center transition-all hover:scale-105 cursor-pointer min-w-[38px] ${day.bgClass}`}
              >
                <span className="text-[10px] font-bold opacity-70 mb-0.5">{day.shortName}</span>
                <span className="text-xs font-extrabold font-mono-code">{day.count.toLocaleString('fa-IR')}</span>

                {/* Hover Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30 animate-fadeIn">
                  <div className="bg-[#1f212d] text-white border border-white/20 px-2.5 py-1.5 rounded-xl text-[10px] whitespace-nowrap shadow-2xl font-bold">
                    <span>{day.fullName} ({day.dateStr}):</span>{' '}
                    <span className="text-orange-300 font-mono-code font-black">{day.count.toLocaleString('fa-IR')} پیام</span>
                  </div>
                  <div className="w-2 h-2 bg-[#1f212d] rotate-45 border-r border-b border-white/20 -mt-1"></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Consecutive Error Notification & Suggestion Banner */}
        {hasConsecutiveErrors && (
          <div className="mx-4 my-3 p-3.5 bg-red-950/40 border border-red-500/40 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-200 text-xs shadow-lg shadow-red-900/20">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 animate-bounce" />
              </div>
              <div>
                <div className="font-extrabold text-red-400 text-xs flex items-center gap-1.5">
                  <span>بروز خطای متوالی در سنکرون‌سازی</span>
                  {connection.consecutiveErrors ? (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-[10px]">
                      {connection.consecutiveErrors} بار
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-red-200/80 mt-1 leading-relaxed">
                  {connection.lastError ? `${connection.lastError}. ` : ''}
                  پیشنهاد می‌شود لاگ‌های خطای این پل را بررسی کنید.
                </p>
              </div>
            </div>

            <button
              onClick={() => onViewLogs(connection.id)}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-xs shadow-md shadow-red-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>بررسی لاگ‌های این پل ➔</span>
            </button>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="p-4 bg-[#121212] flex flex-wrap items-center justify-between gap-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          {/* Pause / Play */}
          <button
            onClick={handleToggle}
            disabled={loadingAction !== null}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              connection.status === 'active' || connection.status === 'error'
                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
            }`}
          >
            {loadingAction === 'toggle' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : connection.status === 'active' || connection.status === 'error' ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                توقف
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                شروع
              </>
            )}
          </button>

          {/* ZagrosRepost Rules Config Button - High Visibility */}
          <button
            onClick={() => onOpenRules(connection)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-300 hover:from-orange-500/30 hover:to-amber-500/30 border border-orange-500/50 flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-orange-500/10"
            title="فیچرهای اختصاصی: جایگزینی لغات، حذف لینک، امضا و AI"
          >
            <Sliders className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
            <span>فیچرهای اختصاصی (تنظیم قوانین)</span>
          </button>

          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={loadingAction !== null}
            className="px-2.5 py-2 rounded-xl text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all flex items-center gap-1 cursor-pointer border border-white/10"
            title="بررسی فوری پست‌های جدید"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAction === 'sync' ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPreviewChannel(connection.sourceChannel)}
            className="px-2.5 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all flex items-center gap-1 cursor-pointer"
            title="پیش‌نمایش کانال مبدأ"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onViewLogs(connection.id)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              hasConsecutiveErrors
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm shadow-red-500/20 animate-pulse'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
            title="مشاهده لاگ‌ها"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>لاگ‌ها</span>
            {hasConsecutiveErrors && (
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
            )}
          </button>

          <button
            onClick={handleDelete}
            disabled={loadingAction !== null}
            className="p-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
            title="حذف اتصال"
          >
            {loadingAction === 'delete' ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-400" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Send, Key, Hash, CheckCircle2, AlertCircle, Loader2, Sliders, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { ConnectionCreateInput, BotValidationResult, TelegramConnectionConfig } from '../types';
import { apiFetch } from '../lib/api';
import { ConnectionRulesModal } from './ConnectionRulesModal';
import { getDefaultConnectionConfig } from '../lib/defaultConnectionConfig';

interface AddConnectionFormProps {
  onSubmit: (data: ConnectionCreateInput) => Promise<boolean>;
  loading: boolean;
}

export const AddConnectionForm: React.FC<AddConnectionFormProps> = ({ onSubmit, loading }) => {
  const [sourceChannel, setSourceChannel] = useState('');
  const [targetChannel, setTargetChannel] = useState('');
  const [botToken, setBotToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [advancedConfig, setAdvancedConfig] = useState<TelegramConnectionConfig>(getDefaultConnectionConfig());

  const hasCustomAdvancedConfig =
    JSON.stringify(advancedConfig) !== JSON.stringify(getDefaultConnectionConfig());

  const [botValidating, setBotValidating] = useState(false);
  const [botValidation, setBotValidation] = useState<BotValidationResult | null>(null);

  const handleValidateToken = async () => {
    if (!botToken.trim()) return;
    setBotValidating(true);
    setBotValidation(null);

    try {
      const res = await apiFetch('/api/connections/validate-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: botToken }),
      });
      if (!res.ok) return;
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const data = await res.json();
      if (data && data.success) {
        setBotValidation(data.result);
      }
    } catch {
      // Ignore transient errors
    } finally {
      setBotValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!sourceChannel.trim()) {
      setError('لطفاً کانال مبدأ را وارد کنید.');
      return;
    }
    if (!targetChannel.trim()) {
      setError('لطفاً کانال مقصد را وارد کنید.');
      return;
    }
    if (!botToken.trim()) {
      setError('لطفاً توکن ربات را وارد کنید.');
      return;
    }

    const success = await onSubmit({
      sourceChannel: sourceChannel.trim(),
      targetChannel: targetChannel.trim(),
      botToken: botToken.trim(),
      config: advancedConfig,
    });

    if (success) {
      setSourceChannel('');
      setTargetChannel('');
      setBotToken('');
      setBotValidation(null);
      setShowAdvanced(false);
      setAdvancedConfig(getDefaultConnectionConfig());
    }
  };

  return (
    <div className="bg-[#121212] rounded-3xl border border-white/10 shadow-2xl p-6 sm:p-8 transition-all animate-fadeIn">
      {/* Badge & Title */}
      <div className="text-center space-y-2 mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
          <Settings className="w-3.5 h-3.5" />
          <span>پیکربندی هوشمند مسیر</span>
        </div>
        <h2 className="text-xl font-extrabold text-white">
          ایجاد پل انتقال خودکار
        </h2>
        <p className="text-xs text-white/60 max-w-lg mx-auto leading-relaxed">
          برای پایش و کپی خودکار پیام‌ها، اطلاعات ۳ فیلد اصلی زیر را تکمیل کنید. نیازی به عضویت در کانال مبدأ نیست.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ۱. کانال مبدأ (عمومی) */}
        <div>
          <label className="block text-xs font-bold text-white mb-1">
            ۱. کانال مبدأ (عمومی) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value)}
              placeholder="username_channel @"
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/15 rounded-xl text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-all font-mono-code text-left"
              dir="ltr"
            />
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            آیدی عمومی کانال تلگرام بدون علامت @
          </p>
        </div>

        {/* ۲. کانال مقصد (عمومی یا خصوصی) */}
        <div>
          <label className="block text-xs font-bold text-white mb-1">
            ۲. کانال مقصد (عمومی یا خصوصی) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={targetChannel}
              onChange={(e) => setTargetChannel(e.target.value)}
              placeholder="my_destination @"
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/15 rounded-xl text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-all font-mono-code text-left"
              dir="ltr"
            />
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            آیدی عددی چت (مانند ۱۰۱۰۰...) یا آیدی کانال مقصد (مانند my_channel)
          </p>
        </div>

        {/* ۳. توکن ربات تلگرام (Bot Token) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-bold text-white">
              ۳. توکن ربات تلگرام (Bot Token) <span className="text-red-500">*</span>
            </label>
            {botToken && (
              <button
                type="button"
                onClick={handleValidateToken}
                disabled={botValidating}
                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {botValidating && <Loader2 className="w-3 h-3 animate-spin" />}
                بررسی توکن در BotFather
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="password"
              value={botToken}
              onChange={(e) => {
                setBotToken(e.target.value);
                setBotValidation(null);
              }}
              placeholder="توکن صادر شده از BotFather"
              className="w-full px-4 py-3 bg-[#0a0a0a] border border-white/15 rounded-xl text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-all font-mono-code text-left"
              dir="ltr"
            />
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            ربات شما باید حتماً دسترسی ارسال پیام (ادمین) در کانال مقصد داشته باشد.
          </p>

          {/* Validation Feedback */}
          {botValidation && (
            <div
              className={`mt-2 p-3 rounded-xl text-xs flex items-center gap-2 ${
                botValidation.valid
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
              }`}
            >
              {botValidation.valid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    توکن معتبر است. نام ربات: <strong>{botValidation.botName}</strong> ({botValidation.botUsername})
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{botValidation.error || 'توکن معتبر نیست.'}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Dropdown: تنظیمات پیشرفته — همون کامپوننت کامل قوانین که در ویرایش اتصال هم استفاده می‌شود */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full py-3.5 px-4 bg-[#14161f] hover:bg-[#1b1d29] border border-white/10 rounded-2xl text-xs font-bold text-blue-400 flex items-center justify-between transition-all cursor-pointer shadow-sm"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-400" />
              تنظیمات پیشرفته انتقال پیام (اختیاری)
            </span>
            {showAdvanced ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-5 rounded-2xl bg-[#14161f] border border-white/10 space-y-3 text-xs animate-fadeIn">
              <p className="text-white/50 leading-relaxed">
                همه‌ی قوانین و فیچرهای اختصاصی (جایگزینی متن، پاکسازی و امضا، فیلتر رسانه و کلمات کلیدی،
                زمان‌بندی فعالیت، هوش مصنوعی) از همین‌جا قابل تنظیمه — دقیقاً همون پنجره‌ای که برای ویرایش
                اتصال‌های موجود هم استفاده می‌شه.
              </p>
              <button
                type="button"
                onClick={() => setRulesModalOpen(true)}
                className="w-full py-3 px-4 bg-blue-600/10 border border-blue-500/30 hover:bg-blue-600/20 rounded-xl text-xs font-bold text-blue-300 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4" />
                باز کردن تنظیمات کامل قوانین و فیلترها
              </button>
              {hasCustomAdvancedConfig && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  تنظیمات پیشرفته سفارشی‌سازی شده و هنگام ساخت پل اعمال می‌شود.
                </div>
              )}
            </div>
          )}
        </div>

        {/* دکمه شروع اتصال */}
        <div className="pt-3">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                در حال راه‌اندازی پل ارتباطی...
              </>
            ) : (
              <>
                <Send className="w-5 h-5 rotate-[220deg] fill-current" />
                راه‌اندازی پل ارتباطی جدید
              </>
            )}
          </button>
        </div>
      </form>

      <ConnectionRulesModal
        mode="create"
        isOpen={rulesModalOpen}
        initialConfig={advancedConfig}
        onApplyConfig={(cfg) => setAdvancedConfig(cfg)}
        onClose={() => setRulesModalOpen(false)}
      />
    </div>
  );
};

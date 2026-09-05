import React, { useEffect, useState } from 'react';
import { X, Settings as SettingsIcon, Eye, EyeOff, Check, AlertCircle, RefreshCw, Bot, Sparkles } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface SettingItem {
  key: string;
  label: string;
  description: string;
  sensitive: boolean;
  appliesTo: 'node' | 'userbot' | 'both';
  value: string;
  source: 'db' | 'env' | 'none';
}

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({ isOpen, onClose }) => {
  const [settings, setSettingsList] = useState<SettingItem[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaveMessage(null);
    setLoading(true);
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSettingsList(data.settings);
          const initial: Record<string, string> = {};
          for (const s of data.settings as SettingItem[]) {
            initial[s.key] = s.value || '';
          }
          setFormValues(initial);
          setOriginalValues(initial);
        } else {
          setError(data.error || 'خطا در دریافت تنظیمات');
        }
      })
      .catch(() => setError('خطا در ارتباط با سرور'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    // فقط کلیدهایی که واقعاً نسبت به مقدار بارگذاری‌شده تغییر کرده‌اند
    // فرستاده می‌شوند — وگرنه چون همه‌ی مقادیر (حتی دست‌نخورده‌ها) در
    // formValues هستند، هر ذخیره‌ای (حتی فقط تغییر کلید Gemini) باعث
    // ری‌استارت بی‌جهت سرویس یوزربات می‌شد.
    const changed: Record<string, string> = {};
    for (const key of Object.keys(formValues)) {
      if (formValues[key] !== (originalValues[key] ?? '')) {
        changed[key] = formValues[key];
      }
    }
    if (Object.keys(changed).length === 0) {
      setSaveMessage('تغییری برای ذخیره وجود نداشت.');
      setTimeout(() => setSaveMessage(null), 4000);
      return;
    }
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: changed }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'خطا در ذخیره تنظیمات');
        setSaving(false);
        return;
      }
      setOriginalValues((prev) => ({ ...prev, ...changed }));
      if (data.userbotRestart) {
        if (data.userbotRestart.success) {
          setSaveMessage('تنظیمات ذخیره شد و سرویس یوزربات با موفقیت با مقادیر جدید ری‌استارت شد.');
        } else {
          setError(
            `تنظیمات ذخیره شد اما ری‌استارت خودکار سرویس یوزربات شکست خورد: ${data.userbotRestart.error || 'خطای نامشخص'}. ` +
              'لازم است دستی روی سرور اجرا کنید: pm2 restart userbot/ecosystem.userbot.config.cjs --update-env'
          );
        }
      } else {
        setSaveMessage('تنظیمات با موفقیت ذخیره شد.');
      }
    } catch {
      setError('خطا در ارتباط با سرور هنگام ذخیره');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 6000);
    }
  };

  const nodeSettings = settings.filter((s) => s.appliesTo === 'node');
  const userbotSettings = settings.filter((s) => s.appliesTo === 'userbot' || s.appliesTo === 'both');

  const renderField = (s: SettingItem) => {
    const isRevealed = revealedKeys[s.key];
    const inputType = s.sensitive && !isRevealed ? 'password' : 'text';
    return (
      <div key={s.key} className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-white/80 font-bold text-xs">{s.label}</label>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              s.source === 'db'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : s.source === 'env'
                  ? 'bg-white/5 border-white/15 text-white/50'
                  : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
            }`}
          >
            {s.source === 'db' ? 'تنظیم‌شده از پنل' : s.source === 'env' ? 'مقدار پیش‌فرض .env' : 'تنظیم نشده'}
          </span>
        </div>
        <p className="text-[11px] text-white/45 leading-relaxed">{s.description}</p>
        <div className="relative">
          <input
            type={inputType}
            value={formValues[s.key] ?? ''}
            onChange={(e) => handleChange(s.key, e.target.value)}
            placeholder={s.sensitive ? '••••••••' : ''}
            dir="ltr"
            className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs font-mono-code text-left focus:outline-none focus:border-blue-500 pl-10"
          />
          {s.sensitive && (
            <button
              type="button"
              onClick={() => toggleReveal(s.key)}
              className="absolute left-2.5 top-2.5 text-white/40 hover:text-white/70 transition-colors"
              tabIndex={-1}
            >
              {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 dir-rtl text-slate-100">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#121212] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 p-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">تنظیمات سیستم</h2>
              <p className="text-xs text-white/50">کلیدهای API و مقادیر لازم برای راه‌اندازی — بدون نیاز به SSH</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-white/50 gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              در حال بارگذاری تنظیمات...
            </div>
          ) : (
            <>
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {saveMessage && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saveMessage}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white/70">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-extrabold">هوش مصنوعی و امنیت پنل</h3>
                </div>
                <div className="space-y-4 p-4 rounded-2xl bg-[#18181b] border border-white/10">
                  {nodeSettings.map(renderField)}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white/70">
                  <Bot className="w-4 h-4 text-teal-400" />
                  <h3 className="text-xs font-extrabold">سرویس یوزربات (تلگرام)</h3>
                </div>
                <p className="text-[11px] text-white/40 -mt-2">
                  این مقادیر بین Node و سرویس یوزربات مشترکند — ذخیره‌ی هرکدام سرویس یوزربات را خودکار ری‌استارت می‌کند تا مقدار جدید اعمال شود.
                </p>
                <div className="space-y-4 p-4 rounded-2xl bg-[#18181b] border border-white/10">
                  {userbotSettings.map(renderField)}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-6 pt-4 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
          </button>
        </div>
      </div>
    </div>
  );
};

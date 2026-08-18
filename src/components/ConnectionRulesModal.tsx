import React, { useState, useEffect } from 'react';
import { TelegramConnection, ReplaceRule, TelegramConnectionConfig } from '../types';
import { getDefaultConnectionConfig } from '../lib/defaultConnectionConfig';
import { PERSIAN_DAY_NAMES, PERSIAN_WEEK_ORDER } from '../lib/persianDays';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Sliders,
  Filter,
  RefreshCw,
  Send,
  FileText,
  Link,
  AtSign,
  Clock,
  Globe,
  Check,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Moon,
  Bookmark,
  Save,
  Download,
  Copy,
} from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  createdAt: string;
  config: TelegramConnectionConfig;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'preset-clean-ad',
    name: 'پاکسازی تبلیغات و امضای اختصاصی',
    createdAt: new Date().toISOString(),
    config: {
      replaceRules: [],
      removeLinks: true,
      removeMentions: true,
      customHeader: '⚡ جدیدترین اخبار',
      customFooter: '📢 عضویت در کانال ما: @my_channel',
      keywordsInclude: [],
      keywordsExclude: ['تبلیغ', 'اسپانسر', 'شارژ'],
      allowedMediaTypes: ['text', 'photo', 'video', 'document', 'voice', 'audio', 'gif'],
      delaySeconds: 5,
      activeScheduleEnabled: false,
      activeScheduleStart: '08:00',
      activeScheduleEnd: '22:00',
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      aiRewrite: false,
      aiTranslate: 'none',
    },
  },
  {
    id: 'preset-ai-full',
    name: 'بازنویسی هوشمند AI + زمان‌بندی روزانه',
    createdAt: new Date().toISOString(),
    config: {
      replaceRules: [],
      removeLinks: true,
      removeMentions: true,
      customHeader: '',
      customFooter: '🤖 بازنویسی شده توسط هوش مصنوعی',
      keywordsInclude: [],
      keywordsExclude: [],
      allowedMediaTypes: ['text', 'photo', 'video'],
      delaySeconds: 10,
      activeScheduleEnabled: true,
      activeScheduleStart: '09:00',
      activeScheduleEnd: '23:00',
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      aiRewrite: true,
      aiTranslate: 'none',
    },
  },
];

interface Props {
  /** 'edit' (default) manages rules for an existing connection. 'create'
   * lets AddConnectionForm reuse this same component to configure rules
   * for a connection that doesn't exist yet — no Test tab (nothing to
   * test against), and onApplyConfig hands the config back instead of
   * calling the save API directly. */
  mode?: 'edit' | 'create';
  connection?: TelegramConnection;
  initialConfig?: TelegramConnectionConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaveConfig?: (connId: string, config: Partial<TelegramConnectionConfig>) => Promise<void>;
  onApplyConfig?: (config: TelegramConnectionConfig) => void;
  onTestSend?: (connId: string, testText?: string) => Promise<{ success: boolean; error?: string }>;
}

export const ConnectionRulesModal: React.FC<Props> = ({
  mode = 'edit',
  connection,
  initialConfig,
  isOpen,
  onClose,
  onSaveConfig,
  onApplyConfig,
  onTestSend,
}) => {
  if (!isOpen) return null;

  const currentConfig: TelegramConnectionConfig =
    connection?.config || initialConfig || getDefaultConnectionConfig();

  const [activeTab, setActiveTab] = useState<'replace' | 'clean' | 'filter' | 'schedule' | 'ai' | 'test'>('replace');
  
  // Local state for rules
  const [replaceRules, setReplaceRules] = useState<ReplaceRule[]>(currentConfig.replaceRules || []);
  const [newSearch, setNewSearch] = useState('');
  const [newReplace, setNewReplace] = useState('');

  // Preset states
  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      const saved = localStorage.getItem('zagros_presets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_PRESETS;
  });
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [presetNotification, setPresetNotification] = useState<string | null>(null);

  // Clean state
  const [removeLinks, setRemoveLinks] = useState(currentConfig.removeLinks || false);
  const [removeMentions, setRemoveMentions] = useState(currentConfig.removeMentions || false);
  const [skipDuplicateContent, setSkipDuplicateContent] = useState(currentConfig.skipDuplicateContent || false);
  const [webhookUrl, setWebhookUrl] = useState(currentConfig.webhookUrl || '');
  const [customHeader, setCustomHeader] = useState(currentConfig.customHeader || '');
  const [customFooter, setCustomFooter] = useState(currentConfig.customFooter || '');

  // Filter state
  const [keywordsIncludeInput, setKeywordsIncludeInput] = useState(
    (currentConfig.keywordsInclude || []).join(', ')
  );
  const [keywordsExcludeInput, setKeywordsExcludeInput] = useState(
    (currentConfig.keywordsExclude || []).join(', ')
  );
  const [allowedMediaTypes, setAllowedMediaTypes] = useState<string[]>(
    currentConfig.allowedMediaTypes || getDefaultConnectionConfig().allowedMediaTypes
  );

  // Schedule state
  const [activeScheduleEnabled, setActiveScheduleEnabled] = useState(
    currentConfig.activeScheduleEnabled || false
  );
  const [activeScheduleStart, setActiveScheduleStart] = useState(
    currentConfig.activeScheduleStart || '08:00'
  );
  const [activeScheduleEnd, setActiveScheduleEnd] = useState(
    currentConfig.activeScheduleEnd || '22:00'
  );
  const [activeDays, setActiveDays] = useState<number[]>(
    currentConfig.activeDays && currentConfig.activeDays.length > 0
      ? currentConfig.activeDays
      : [0, 1, 2, 3, 4, 5, 6]
  );

  // AI & Delay
  const [delaySeconds, setDelaySeconds] = useState(currentConfig.delaySeconds || 0);
  const [aiRewrite, setAiRewrite] = useState(currentConfig.aiRewrite || false);
  const [aiTranslate, setAiTranslate] = useState<'fa' | 'en' | 'ar' | 'none'>(
    currentConfig.aiTranslate || 'none'
  );

  // Test send state
  const [testText, setTestText] = useState(
    `🤖 تست اتوماسیون زاگرس ریپوست (ZagrosRepost)\n\nارسال آزمایشی به کانال ${connection?.targetChannel || ''}`
  );
  const [testSending, setTestSending] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success?: boolean; msg?: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  const toggleDay = (dayId: number) => {
    if (activeDays.includes(dayId)) {
      if (activeDays.length === 1) return; // keep at least 1 day
      setActiveDays(activeDays.filter((d) => d !== dayId));
    } else {
      setActiveDays([...activeDays, dayId]);
    }
  };

  const handleAddRule = () => {
    if (!newSearch.trim()) return;
    setReplaceRules([
      ...replaceRules,
      {
        id: Math.random().toString(36).substring(2, 9),
        search: newSearch.trim(),
        replace: newReplace.trim(),
      },
    ]);
    setNewSearch('');
    setNewReplace('');
  };

  const handleRemoveRule = (id: string) => {
    setReplaceRules(replaceRules.filter((r) => r.id !== id));
  };

  const toggleMediaType = (type: string) => {
    if (allowedMediaTypes.includes(type)) {
      setAllowedMediaTypes(allowedMediaTypes.filter((t) => t !== type));
    } else {
      setAllowedMediaTypes([...allowedMediaTypes, type]);
    }
  };

  const handleApplyPreset = (preset: Preset) => {
    const cfg = preset.config;
    if (cfg.replaceRules) setReplaceRules(cfg.replaceRules);
    if (cfg.removeLinks !== undefined) setRemoveLinks(cfg.removeLinks);
    if (cfg.removeMentions !== undefined) setRemoveMentions(cfg.removeMentions);
    if (cfg.skipDuplicateContent !== undefined) setSkipDuplicateContent(cfg.skipDuplicateContent);
    if (cfg.webhookUrl !== undefined) setWebhookUrl(cfg.webhookUrl);
    if (cfg.customHeader !== undefined) setCustomHeader(cfg.customHeader);
    if (cfg.customFooter !== undefined) setCustomFooter(cfg.customFooter);
    if (cfg.keywordsInclude) setKeywordsIncludeInput(cfg.keywordsInclude.join(', '));
    if (cfg.keywordsExclude) setKeywordsExcludeInput(cfg.keywordsExclude.join(', '));
    if (cfg.allowedMediaTypes) setAllowedMediaTypes(cfg.allowedMediaTypes);
    if (cfg.delaySeconds !== undefined) setDelaySeconds(cfg.delaySeconds);
    if (cfg.activeScheduleEnabled !== undefined) setActiveScheduleEnabled(cfg.activeScheduleEnabled);
    if (cfg.activeScheduleStart) setActiveScheduleStart(cfg.activeScheduleStart);
    if (cfg.activeScheduleEnd) setActiveScheduleEnd(cfg.activeScheduleEnd);
    if (cfg.activeDays) setActiveDays(cfg.activeDays);
    if (cfg.aiRewrite !== undefined) setAiRewrite(cfg.aiRewrite);
    if (cfg.aiTranslate) setAiTranslate(cfg.aiTranslate);

    setPresetNotification(`تنظیمات پریست "${preset.name}" با موفقیت جایگذاری شد.`);
    setTimeout(() => setPresetNotification(null), 4000);
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;

    const keywordsInclude = keywordsIncludeInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const keywordsExclude = keywordsExcludeInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const newPreset: Preset = {
      id: 'preset_' + Date.now().toString(36),
      name: newPresetName.trim(),
      createdAt: new Date().toISOString(),
      config: {
        replaceRules,
        removeLinks,
        removeMentions,
        skipDuplicateContent,
        webhookUrl,
        customHeader,
        customFooter,
        keywordsInclude,
        keywordsExclude,
        allowedMediaTypes,
        delaySeconds: Number(delaySeconds) || 0,
        activeScheduleEnabled,
        activeScheduleStart,
        activeScheduleEnd,
        activeDays,
        aiRewrite,
        aiTranslate,
      },
    };

    const updated = [...presets, newPreset];
    setPresets(updated);
    try {
      localStorage.setItem('zagros_presets', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }

    setNewPresetName('');
    setIsSavingPreset(false);
    setSelectedPresetId(newPreset.id);
    setPresetNotification(`پریست جدید "${newPreset.name}" ذخیره شد.`);
    setTimeout(() => setPresetNotification(null), 4000);
  };

  const handleDeletePreset = (id: string) => {
    const target = presets.find((p) => p.id === id);
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    try {
      localStorage.setItem('zagros_presets', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (selectedPresetId === id) setSelectedPresetId('');
    if (target) {
      setPresetNotification(`پریست "${target.name}" حذف شد.`);
      setTimeout(() => setPresetNotification(null), 4000);
    }
  };

  const handleSave = async () => {
    const keywordsInclude = keywordsIncludeInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const keywordsExclude = keywordsExcludeInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const builtConfig: TelegramConnectionConfig = {
      replaceRules,
      removeLinks,
      removeMentions,
      skipDuplicateContent,
      webhookUrl,
      customHeader,
      customFooter,
      keywordsInclude,
      keywordsExclude,
      allowedMediaTypes,
      delaySeconds: Number(delaySeconds) || 0,
      activeScheduleEnabled,
      activeScheduleStart,
      activeScheduleEnd,
      activeDays,
      aiRewrite,
      aiTranslate,
    };

    if (mode === 'create') {
      onApplyConfig?.(builtConfig);
      onClose();
      return;
    }

    if (!connection || !onSaveConfig) return;

    setIsSaving(true);
    try {
      await onSaveConfig(connection.id, builtConfig);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunTestSend = async () => {
    if (!connection || !onTestSend) return;
    setTestSending(true);
    setTestStatus(null);
    try {
      const res = await onTestSend(connection.id, testText);
      if (res.success) {
        setTestStatus({ success: true, msg: 'پیام تست با موفقیت به کانال مقصد ارسال شد!' });
      } else {
        setTestStatus({ success: false, msg: res.error || 'خطا در ارسال تست' });
      }
    } catch (e) {
      setTestStatus({ success: false, msg: 'خطای غیرمنتظره در ارتباط با سرور' });
    } finally {
      setTestSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 dir-rtl">
      <div className="relative w-full max-w-3xl bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#18181b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {mode === 'create'
                  ? 'تنظیمات پیشرفته و قوانین اختصاصی پل جدید'
                  : 'مدیریت قوانین و فیچرهای اختصاصی زاگرس ریپوست (ZagrosRepost)'}
              </h2>
              {connection && (
                <p className="text-xs text-white/50 font-mono-code">
                  {connection.sourceChannel} ➔ {connection.targetChannel}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Toolbar */}
        <div className="bg-[#141622] border-b border-white/10 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-orange-400 shrink-0" />
            <span className="font-bold text-white/80">پریست‌های پیش‌فرض و ذخیره‌شده:</span>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedPresetId(val);
                const p = presets.find((item) => item.id === val);
                if (p) handleApplyPreset(p);
              }}
              className="bg-[#0a0a10] border border-white/20 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-orange-500 font-medium cursor-pointer"
            >
              <option value="">انتخاب یک پریست جهت اعمال روی این پل...</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#18181b] text-white">
                  {p.name}
                </option>
              ))}
            </select>

            {selectedPresetId && (
              <button
                type="button"
                onClick={() => handleDeletePreset(selectedPresetId)}
                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                title="حذف پریست انتخابی"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isSavingPreset ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="نام پریست (مثلاً: قالب کانال خبری)"
                  className="px-2.5 py-1 text-xs bg-[#0a0a10] border border-white/20 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  ذخیره
                </button>
                <button
                  type="button"
                  onClick={() => setIsSavingPreset(false)}
                  className="px-2 py-1 text-white/50 hover:text-white cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSavingPreset(true)}
                className="px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-300 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-orange-400" />
                ذخیره تنظیمات فعلی به‌عنوان پریست جدید
              </button>
            )}
          </div>
        </div>

        {/* Preset Notification Banner */}
        {presetNotification && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-6 py-2 text-xs font-bold text-emerald-300 flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{presetNotification}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-[#0e0e11] px-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('replace')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'replace'
                ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            جایگزینی متن و لغات
          </button>

          <button
            onClick={() => setActiveTab('clean')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'clean'
                ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            پاکسازی و امضا
          </button>

          <button
            onClick={() => setActiveTab('filter')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'filter'
                ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Filter className="w-4 h-4" />
            فیلترها & رسانه
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'schedule'
                ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4 text-orange-400" />
            زمان‌بندی فعالیت
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'ai'
                ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-orange-400" />
            هوش مصنوعی (Gemini AI)
          </button>

          {mode !== 'create' && (
            <button
              onClick={() => setActiveTab('test')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === 'test'
                  ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                  : 'border-transparent text-white/60 hover:text-white'
              }`}
            >
              <Send className="w-4 h-4" />
              ارسال تست به مقصد
            </button>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: Replace Rules */}
          {activeTab === 'replace' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70">
                <p className="font-semibold text-orange-400 mb-1">
                  💡 جایگزینی خودکار کلمات، آیدی‌ها و آدرس‌های اینترنتی
                </p>
                می‌توانید آیدی کانال مبدأ، عبارت‌های تبلیغاتی یا شماره تماس‌های پست‌ها را به‌طور خودکار با
                عبارات و آیدی‌های کانال خودتان جایگزین نمایید.
              </div>

              {/* Add New Rule */}
              <div className="p-4 rounded-xl bg-[#18181b] border border-white/10 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  افزودن قانون جدید
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">
                      عبارت یا آیدی جستجو شده (مثلاً @SourceChannel):
                    </label>
                    <input
                      type="text"
                      value={newSearch}
                      onChange={(e) => setNewSearch(e.target.value)}
                      placeholder="@old_channel"
                      className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">
                      جایگزین شود با (مثلاً @MyTargetChannel):
                    </label>
                    <input
                      type="text"
                      value={newReplace}
                      onChange={(e) => setNewReplace(e.target.value)}
                      placeholder="@my_channel (یا خالی برای حذف)"
                      className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddRule}
                  disabled={!newSearch.trim()}
                  className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  افزودن به قوانین جایگزینی
                </button>
              </div>

              {/* Existing Rules List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white/80">
                  قوانین فعلی ({replaceRules.length}):
                </h4>
                {replaceRules.length === 0 ? (
                  <p className="text-xs text-white/40 italic py-4 text-center">
                    هیچ قانون جایگزینی ثبت نشده است.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {replaceRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-[#18181b] border border-white/10 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono-code text-orange-400 bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20">
                            {rule.search}
                          </span>
                          <span className="text-white/40">➔</span>
                          <span className="font-mono-code text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                            {rule.replace || '(حذف عبارت)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRule(rule.id)}
                          className="text-red-400 hover:text-red-300 p-1 hover:bg-red-500/10 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Clean & Signature */}
          {activeTab === 'clean' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  onClick={() => setRemoveLinks(!removeLinks)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    removeLinks
                      ? 'bg-orange-500/10 border-orange-500/40 text-white'
                      : 'bg-[#18181b] border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${removeLinks ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                    <Link className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white mb-1">حذف تمام لینک‌های وب</h4>
                    <p className="text-[11px] text-white/50">
                      تمامی آدرس‌های http/https و t.me موجود در متن پست به‌طور کامل پاک‌سازی می‌شوند.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setRemoveMentions(!removeMentions)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    removeMentions
                      ? 'bg-orange-500/10 border-orange-500/40 text-white'
                      : 'bg-[#18181b] border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${removeMentions ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                    <AtSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white mb-1">حذف تمام آیدی‌های تلگرام (@)</h4>
                    <p className="text-[11px] text-white/50">
                      تمام نام‌های کاربری مانند @username از متن پست‌ها حذف می‌گردند.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setSkipDuplicateContent(!skipDuplicateContent)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    skipDuplicateContent
                      ? 'bg-orange-500/10 border-orange-500/40 text-white'
                      : 'bg-[#18181b] border-white/10 text-white/60 hover:border-white/20'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${skipDuplicateContent ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                    <Copy className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white mb-1">رد کردن محتوای تکراری</h4>
                    <p className="text-[11px] text-white/50">
                      اگر متن پست (بعد از پردازش) در ۷ روز اخیر برای همین پل قبلاً ارسال شده باشد، دوباره ارسال نمی‌شود.
                    </p>
                  </div>
                </div>

                {/* Outbound Webhook — فاز ۳ب */}
                <div className="p-4 rounded-xl border bg-[#18181b] border-white/10">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-white/10">
                      <Send className="w-4 h-4 text-white/60" />
                    </div>
                    <h4 className="text-xs font-bold text-white">Webhook خروجی (اختیاری)</h4>
                  </div>
                  <p className="text-[11px] text-white/50 mb-2">
                    بعد از هر ارسال موفق، یک درخواست POST با جزئیات پست به این آدرس فرستاده می‌شود — برای یکپارچگی با ابزارهای دیگر شما (Zapier، n8n، اسکریپت شخصی).
                  </p>
                  <input
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://example.com/webhook"
                    dir="ltr"
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs font-mono-code text-left"
                  />
                </div>
              </div>

              {/* Custom Header */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">
                  تیتر اختصاصی بالایی (Header):
                </label>
                <textarea
                  rows={2}
                  value={customHeader}
                  onChange={(e) => setCustomHeader(e.target.value)}
                  placeholder="متنی که بالای تمام پست‌های منتقل‌شده اضافه می‌شود..."
                  className="w-full p-3 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Custom Footer / Signature */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">
                  امضای اختصاصی تبلیغاتی پایانی (Footer):
                </label>
                <textarea
                  rows={3}
                  value={customFooter}
                  onChange={(e) => setCustomFooter(e.target.value)}
                  placeholder="📢 عضویت در کانال ما: @my_channel_id"
                  className="w-full p-3 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Filter & Media */}
          {activeTab === 'filter' && (
            <div className="space-y-5">
              {/* Media Types */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-white">انواع رسانه مجاز برای ارسال:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'text', label: 'متن ساده' },
                    { id: 'photo', label: 'تصویر / عکس' },
                    { id: 'video', label: 'ویدیو' },
                    { id: 'document', label: 'فایل / سند' },
                    { id: 'voice', label: 'ویس / ویس نوت' },
                    { id: 'audio', label: 'موزیک / صوتی' },
                    { id: 'gif', label: 'گیف (GIF)' },
                    { id: 'sticker', label: 'استیکر' },
                  ].map((m) => {
                    const selected = allowedMediaTypes.includes(m.id);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => toggleMediaType(m.id)}
                        className={`p-2.5 rounded-lg text-xs font-medium border flex items-center justify-between transition-all ${
                          selected
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                            : 'bg-[#18181b] border-white/10 text-white/50 hover:text-white'
                        }`}
                      >
                        <span>{m.label}</span>
                        {selected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Keyword Include Filter */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">
                  فیلتر کلمات کلیدی الزامی (جداشده با کاما):
                </label>
                <input
                  type="text"
                  value={keywordsIncludeInput}
                  onChange={(e) => setKeywordsIncludeInput(e.target.value)}
                  placeholder="ارز, تخفیف, فوری (فقط پست‌های حاوی حداقل یکی از این کلمات منتقل می‌شوند)"
                  className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Keyword Exclude Filter */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">
                  فیلتر لیست سیاه / کلمات ممنوعه (جداشده با کاما):
                </label>
                <input
                  type="text"
                  value={keywordsExcludeInput}
                  onChange={(e) => setKeywordsExcludeInput(e.target.value)}
                  placeholder="تبلیغ, رزرو, اسپانسر (پست‌های حاوی این کلمات رد می‌شوند)"
                  className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Send Delay */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  تاخیر زمانی ارسال (بر حسب ثانیه):
                </label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                />
                <p className="text-[11px] text-white/40">
                  تنظیم تاخیر باعث می‌شود ارسال پست‌ها کاملاً طبیعی‌تر و شبیه به ارسال دستی به‌نظر برسد.
                </p>
              </div>
            </div>
          )}

          {/* TAB: Schedule (زمان‌بندی فعالیت) */}
          {activeTab === 'schedule' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-[#18181b] border border-white/10 text-xs text-white/70">
                <p className="font-semibold text-orange-400 mb-1 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  زمان‌بندی ساعات کاری و خاموشی خودکار پل
                </p>
                با تنظیم این بخش می‌توانید تعیین کنید که این پل فقط در ساعات مشخصی از شبانه‌روز یا روزهای خاصی از هفته فعال باشد تا در زمان‌های خلوتی یا شبانه مزاحمتی برای مخاطبان کانال مقصد ایجاد نشود.
              </div>

              {/* Toggle Enable Auto Schedule */}
              <div
                onClick={() => setActiveScheduleEnabled(!activeScheduleEnabled)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  activeScheduleEnabled
                    ? 'bg-orange-500/15 border-orange-500 text-white'
                    : 'bg-[#18181b] border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                <div className={`p-2 rounded-lg ${activeScheduleEnabled ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white mb-1">
                      فعال‌سازی محدودیت زمانی (Auto Schedule)
                    </h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      activeScheduleEnabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 text-white/40'
                    }`}>
                      {activeScheduleEnabled ? 'فعال' : 'غیرفعال (۲۴ ساعته)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50">
                    در صورت غیرفعال بودن، پیام‌ها بدون محدودیت زمانی در تمام ساعات شبانه‌روز منتقل می‌شوند.
                  </p>
                </div>
              </div>

              {/* Time pickers and Days when enabled */}
              <div className={`space-y-5 transition-all ${activeScheduleEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                {/* Time Range */}
                <div className="p-4 bg-[#18181b] border border-white/10 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-400" />
                    بازه زمانی فعالیت روزانه:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">
                        ساعت شروع فعالیت (Start Time):
                      </label>
                      <input
                        type="time"
                        value={activeScheduleStart}
                        onChange={(e) => setActiveScheduleStart(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500 font-mono-code"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-white/60 mb-1">
                        ساعت پایان فعالیت (End Time):
                      </label>
                      <input
                        type="time"
                        value={activeScheduleEnd}
                        onChange={(e) => setActiveScheduleEnd(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#0a0a0a] border border-white/15 rounded-lg text-white focus:outline-none focus:border-orange-500 font-mono-code"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-white/40">
                    مثال: از ۰۸:۰۰ صبح تا ۲۲:۰۰ شب. (اگر ساعت شروع بزرگتر از پایان باشد، بازه تا بامداد روز بعد محاسبه می‌شود).
                  </p>
                </div>

                {/* Days of Week */}
                <div className="p-4 bg-[#18181b] border border-white/10 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-400" />
                    روزهای فعال هفته:
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PERSIAN_WEEK_ORDER.map((dayId) => {
                      const isSelected = activeDays.includes(dayId);
                      return (
                        <button
                          type="button"
                          key={dayId}
                          onClick={() => toggleDay(dayId)}
                          className={`p-2.5 rounded-lg text-xs font-medium border flex items-center justify-between transition-all ${
                            isSelected
                              ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                              : 'bg-[#0a0a0a] border-white/10 text-white/40 hover:text-white'
                          }`}
                        >
                          <span>{PERSIAN_DAY_NAMES[dayId]}</span>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Current Live Schedule Status Badge */}
                {(() => {
                  const now = new Date();
                  const currentDay = now.getDay();
                  const isDayMatch = activeDays.includes(currentDay);

                  const curMin = now.getHours() * 60 + now.getMinutes();
                  const [sH, sM] = activeScheduleStart.split(':').map(Number);
                  const stMin = (sH || 0) * 60 + (sM || 0);
                  const [eH, eM] = activeScheduleEnd.split(':').map(Number);
                  const enMin = (eH || 0) * 60 + (eM || 0);

                  let isTimeMatch = false;
                  if (stMin <= enMin) {
                    isTimeMatch = curMin >= stMin && curMin <= enMin;
                  } else {
                    isTimeMatch = curMin >= stMin || curMin <= enMin;
                  }

                  const formattedTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                  const isCurrentlyActive = isDayMatch && isTimeMatch;

                  return (
                    <div
                      className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                        isCurrentlyActive
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isCurrentlyActive ? (
                          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                        ) : (
                          <Moon className="w-5 h-5 shrink-0 text-amber-400" />
                        )}
                        <div>
                          <div className="font-bold">
                            وضعیت زمان‌بندی هم‌اکنون: {isCurrentlyActive ? 'فعال و در حال ارسال' : 'خارج از بازه زمانی (غیرفعال)'}
                          </div>
                          <div className="text-[11px] opacity-80 mt-0.5">
                            ساعت و روز جاری: {formattedTime} | {isCurrentlyActive ? 'پیام‌های جدید بلافاصله منتقل می‌شوند.' : 'پست‌های جدید تا رسیدن به بازه مجاز رد می‌شوند.'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* TAB 4: Gemini AI */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs text-orange-300 flex items-start gap-3">
                <Sparkles className="w-5 h-5 shrink-0 text-orange-400" />
                <div>
                  <h4 className="font-bold text-white mb-1">بازنویسی و ترجمه هوشمند با Gemini AI</h4>
                  با فعال‌سازی این قابلیت، تمام پست‌های متنی دریافت شده از کانال مبدأ قبل از انتشار در
                  کانال مقصد، توسط هوش مصنوعی بازنویسی یا ترجمه می‌شوند تا متن کاملاً یکتا و جذاب تولید گردد.
                </div>
              </div>

              {/* AI Rewrite Toggle */}
              <div
                onClick={() => setAiRewrite(!aiRewrite)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  aiRewrite
                    ? 'bg-orange-500/15 border-orange-500 text-white'
                    : 'bg-[#18181b] border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                <div className={`p-2 rounded-lg ${aiRewrite ? 'bg-orange-500 text-white' : 'bg-white/10'}`}>
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white mb-1">
                    بازنویسی لحن و پارافریز خودکار (AI Rephrase)
                  </h4>
                  <p className="text-[11px] text-white/50">
                    هوش مصنوعی متن پست را با حفظ مفهوم و ایموجی‌ها مجدداً به لحنی روان و جذاب بازنویسی می‌کند.
                  </p>
                </div>
              </div>

              {/* AI Auto Translate */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-orange-400" />
                  ترجمه خودکار به زبان دیگر:
                </label>
                <select
                  value={aiTranslate}
                  onChange={(e) => setAiTranslate(e.target.value as any)}
                  className="w-full p-3 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="none">غیرفعال (بدون تغییر زبان)</option>
                  <option value="fa">ترجمه به فارسی (Persian)</option>
                  <option value="en">ترجمه به انگلیسی (English)</option>
                  <option value="ar">ترجمه به عربی (Arabic)</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 5: Live Test Send */}
          {activeTab === 'test' && mode !== 'create' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-white/70">
                <p className="font-semibold text-orange-400 mb-1">
                  🧪 تست زنده دسترسی ربات و ارسال پیام
                </p>
                یک پیام تست مستقیماً به کانال مقصد ارسال می‌شود تا از ادمین بودن ربات و صحت توکن اطمینان
                حاصل کنید.
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">متن پیام آزمایشی:</label>
                <textarea
                  rows={4}
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  className="w-full p-3 text-xs bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="button"
                onClick={handleRunTestSend}
                disabled={testSending}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20"
              >
                {testSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    در حال ارسال پیام به کانال {connection?.targetChannel}...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    ارسال زنده پیام تست به {connection?.targetChannel}
                  </>
                )}
              </button>

              {testStatus && (
                <div
                  className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
                    testStatus.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  {testStatus.success ? (
                    <Check className="w-5 h-5 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                  )}
                  <span>{testStatus.msg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#18181b]">
          <span className="text-[11px] text-white/40 font-mono-code">ZagrosRepost Engine v2.0</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-white/60 hover:text-white transition-colors"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2"
            >
              {isSaving ? 'در حال ذخیره...' : mode === 'create' ? 'اعمال این تنظیمات روی پل جدید' : 'ذخیره تمام تنظیمات'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

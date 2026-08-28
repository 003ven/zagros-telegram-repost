import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  Database,
  CheckCircle2,
  AlertCircle,
  FileJson,
  RefreshCw,
  Info,
  Sliders,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { TelegramConnection } from '../types';
import { apiFetch } from '../lib/api';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: TelegramConnection[];
  onRestoreSuccess: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  connections,
  onRestoreSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle Export Download
  const handleExport = () => {
    try {
      const backupData = {
        app: 'Zagros Repost',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        totalConnections: connections.length,
        connections,
      };

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `zagros_repost_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('خطا در دانلود فایل پشتیبان');
    }
  };

  // Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setRestoreSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);

        if (!data || !Array.isArray(data.connections)) {
          setParseError('فرمت فایل پشتیبان نا معتبر است. لیست connections پیدا نشد.');
          setParsedBackup(null);
          return;
        }

        setParsedBackup(data);
      } catch (err) {
        setParseError('فایل متنی انتخابی قالب JSON معتبر ندارد.');
        setParsedBackup(null);
      }
    };
    reader.readAsText(file);
  };

  // Execute Restore Request
  const handleRestore = async () => {
    if (!parsedBackup || !Array.isArray(parsedBackup.connections)) return;

    setIsRestoring(true);
    setParseError(null);
    setRestoreSuccessMsg(null);

    try {
      const res = await apiFetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connections: parsedBackup.connections,
          mode: restoreMode,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setRestoreSuccessMsg(data.message || 'پشتیبان با موفقیت بازیابی شد.');
        onRestoreSuccess();
        setTimeout(() => {
          setSelectedFile(null);
          setParsedBackup(null);
          setRestoreSuccessMsg(null);
        }, 3000);
      } else {
        setParseError(data.error || 'خطا در بازیابی پشتیبان');
      }
    } catch (err) {
      setParseError('خطا در ارتباط با سرور هنگام بازیابی پشتیبان');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#12141d] border border-white/15 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#181a26]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                پشتیبان‌گیری و بازیابی تنظیمات (Backup & Restore)
              </h3>
              <p className="text-[11px] text-white/50">
                خروجی گرفتن از تمام پل‌ها و قوانین یا بازگردانی فایل پشتیبان
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-white/10 bg-[#141622]">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4 text-blue-400" />
            دانلود خروجی (Export Backup)
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-3 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            بازیابی فایل پشتیبان (Restore)
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-[#181a26] border border-white/10 text-xs text-white/70 space-y-2">
                <p className="font-bold text-blue-400 flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  خروجی جامع پشتیبان
                </p>
                <p>
                  با کلیک روی دکمه زیر، فایل پشتیبان با پسوند <code className="text-amber-300 font-mono-code bg-black/40 px-1.5 py-0.5 rounded">.json</code> شامل تمام پل‌های فعال، توکن‌های ربات، قوانین بازنویسی متن، فیلترهای کلمات و زمان‌بندی دانلود می‌شود.
                </p>
              </div>

              {/* Status Box */}
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-white flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black font-mono-code text-blue-400">
                    {connections.length} <span className="text-xs text-white/50 font-normal">پل ثبت‌شده</span>
                  </div>
                  <div className="text-xs text-white/70 mt-1">
                    آماده برای خروجی گرفتن و ذخیره مطمئن
                  </div>
                </div>

                <button
                  onClick={handleExport}
                  disabled={connections.length === 0}
                  className="px-5 py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  دانلود فایل پشتیبان (JSON)
                </button>
              </div>

              {/* List Preview */}
              {connections.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-white/80">لیست پل‌های موجود در پشتیبان:</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {connections.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 bg-[#181a26] border border-white/5 rounded-xl text-xs flex items-center justify-between text-white/80"
                      >
                        <div className="flex items-center gap-2">
                          <Radio className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="font-bold text-white font-mono-code">{c.sourceChannel}</span>
                          <span className="text-white/40">➔</span>
                          <span className="font-bold text-blue-300 font-mono-code">{c.targetChannel}</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                          {c.config?.replaceRules?.length || 0} قانون
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
                  هنوز هیچ پلی ساخته نشده است. ابتدا یک پل جدید ایجاد کنید.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT / RESTORE */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* File Selector */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-2xl border-2 border-dashed border-white/15 hover:border-emerald-500/50 bg-[#181a26] text-center cursor-pointer transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json,application/json"
                  className="hidden"
                />
                <FileJson className="w-10 h-10 mx-auto text-emerald-400/60 group-hover:text-emerald-400 group-hover:scale-110 transition-all mb-2" />
                <p className="text-xs font-bold text-white mb-1">
                  {selectedFile ? selectedFile.name : 'برای انتخاب فایل پشتیبان (JSON) کلیک کنید یا آن را کشیده و رها کنید'}
                </p>
                <p className="text-[10px] text-white/40">
                  فقط فایل‌های JSON صادرشده از سامانه زاگرس ریپوست پشتیبانی می‌شوند
                </p>
              </div>

              {/* Error Box */}
              {parseError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Success Notification */}
              {restoreSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{restoreSuccessMsg}</span>
                </div>
              )}

              {/* Parsed File Preview & Options */}
              {parsedBackup && (
                <div className="space-y-4 bg-[#181a26] p-4 rounded-2xl border border-white/10">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Info className="w-4 h-4 text-emerald-400" />
                      پیش‌نمایش محتوای پشتیبان
                    </span>
                    <span className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                      {parsedBackup.connections.length} پل کشف گردید
                    </span>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-white/80">
                      نحوه بازگردانی (Restore Mode):
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRestoreMode('merge')}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          restoreMode === 'merge'
                            ? 'bg-emerald-500/20 border-emerald-500 text-white'
                            : 'bg-[#0a0a0a] border-white/10 text-white/50 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold">ادغام (Merge)</div>
                        <div className="text-[10px] text-white/50 mt-0.5">افزودن به پل‌های موجود بدون حذف</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRestoreMode('overwrite')}
                        className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                          restoreMode === 'overwrite'
                            ? 'bg-amber-500/20 border-amber-500 text-white'
                            : 'bg-[#0a0a0a] border-white/10 text-white/50 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold text-amber-400">جایگزینی کامل (Overwrite)</div>
                        <div className="text-[10px] text-white/50 mt-0.5">حذف پل‌های فعلی و جایگزینی کامل</div>
                      </button>
                    </div>
                  </div>

                  {/* Restorable Connections list */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 pt-2">
                    {parsedBackup.connections.map((c: any, index: number) => (
                      <div
                        key={c.id || index}
                        className="p-2.5 bg-[#0a0a0a] border border-white/5 rounded-xl text-xs flex items-center justify-between text-white/80"
                      >
                        <div className="flex items-center gap-2">
                          <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="font-bold text-white font-mono-code">{c.sourceChannel}</span>
                          <span className="text-white/40">➔</span>
                          <span className="font-bold text-emerald-300 font-mono-code">{c.targetChannel}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <button
                    onClick={handleRestore}
                    disabled={isRestoring}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    {isRestoring ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        در حال بازیابی اطلاعات...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        تایید و بازیابی اطلاعات
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/10 bg-[#181a26] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, Send, Instagram, MessageCircle, Link, Check } from 'lucide-react';

export interface FooterLinksConfig {
  supportLabel: string;
  supportUrl: string;
  telegramLabel: string;
  telegramUrl: string;
  instagramLabel: string;
  instagramUrl: string;
}

interface EditFooterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: FooterLinksConfig;
  onSave: (newConfig: FooterLinksConfig) => void;
}

export const EditFooterModal: React.FC<EditFooterModalProps> = ({
  isOpen,
  onClose,
  initialConfig,
  onSave,
}) => {
  if (!isOpen) return null;

  const [supportLabel, setSupportLabel] = useState(initialConfig.supportLabel);
  const [supportUrl, setSupportUrl] = useState(initialConfig.supportUrl);
  const [telegramLabel, setTelegramLabel] = useState(initialConfig.telegramLabel);
  const [telegramUrl, setTelegramUrl] = useState(initialConfig.telegramUrl);
  const [instagramLabel, setInstagramLabel] = useState(initialConfig.instagramLabel);
  const [instagramUrl, setInstagramUrl] = useState(initialConfig.instagramUrl);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      supportLabel: supportLabel.trim() || 'پشتیبانی: mahdi7ai',
      supportUrl: supportUrl.trim() || 'https://t.me/mahdi7ai',
      telegramLabel: telegramLabel.trim() || 'کانال تلگرام: coverbesaz',
      telegramUrl: telegramUrl.trim() || 'https://t.me/coverbesaz',
      instagramLabel: instagramLabel.trim() || 'صفحه اینستاگرام',
      instagramUrl: instagramUrl.trim() || 'https://instagram.com',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 dir-rtl">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Link className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                تنظیم لینک‌های ارتباطی فوتر
              </h2>
              <p className="text-xs text-white/50">
                ویرایش آدرس تلگرام، اینستاگرام و پشتیبانی انتهای صفحه
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Support */}
          <div className="p-4 rounded-2xl bg-[#18181b] border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              <MessageCircle className="w-4 h-4" />
              <span>پشتیبانی / پیوی تلگرام</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-white/60 mb-1">عنوان دکمه:</label>
                <input
                  type="text"
                  value={supportLabel}
                  onChange={(e) => setSupportLabel(e.target.value)}
                  placeholder="پیوی: mahdi7ai"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-white/60 mb-1">لینک پشتیبانی:</label>
                <input
                  type="text"
                  value={supportUrl}
                  onChange={(e) => setSupportUrl(e.target.value)}
                  placeholder="https://t.me/mahdi7ai"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs font-mono-code text-left"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* Telegram Channel */}
          <div className="p-4 rounded-2xl bg-[#18181b] border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              <Send className="w-4 h-4" />
              <span>کانال تلگرام</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-white/60 mb-1">عنوان کانال:</label>
                <input
                  type="text"
                  value={telegramLabel}
                  onChange={(e) => setTelegramLabel(e.target.value)}
                  placeholder="کانال تلگرام: coverbesaz"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-white/60 mb-1">لینک کانال:</label>
                <input
                  type="text"
                  value={telegramUrl}
                  onChange={(e) => setTelegramUrl(e.target.value)}
                  placeholder="https://t.me/coverbesaz"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs font-mono-code text-left"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* Instagram Page */}
          <div className="p-4 rounded-2xl bg-[#18181b] border border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-pink-400 font-bold">
              <Instagram className="w-4 h-4" />
              <span>صفحه اینستاگرام</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-white/60 mb-1">عنوان صفحه:</label>
                <input
                  type="text"
                  value={instagramLabel}
                  onChange={(e) => setInstagramLabel(e.target.value)}
                  placeholder="پیج اینستاگرام"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-white/60 mb-1">لینک اینستاگرام:</label>
                <input
                  type="text"
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/my_page"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs font-mono-code text-left"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs text-white/60 hover:text-white transition-all cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              ذخیره تغییرات
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

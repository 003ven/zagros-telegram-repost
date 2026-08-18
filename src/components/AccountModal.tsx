import React, { useState } from 'react';
import { X, User, Phone, Key, Shield, Check, Crown, Clock, Database, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onUpdateUser: (newName: string) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  userName,
  onUpdateUser,
}) => {
  if (!isOpen) return null;

  const [nameInput, setNameInput] = useState(userName || 'کاربر زاگرس');
  const [phoneInput, setPhoneInput] = useState('09123456789');
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    // If the user typed a new password, change it on the server first.
    if (newPasswordInput.trim()) {
      if (!oldPasswordInput.trim()) {
        setPasswordError('برای تغییر رمز عبور، ابتدا رمز فعلی را وارد کنید.');
        return;
      }
      setSavingPassword(true);
      try {
        const res = await apiFetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword: oldPasswordInput.trim(), newPassword: newPasswordInput.trim() }),
        });
        const data = await res.json();
        if (!data.success) {
          setPasswordError(data.error || 'خطا در تغییر رمز عبور');
          setSavingPassword(false);
          return;
        }
      } catch {
        setPasswordError('خطا در ارتباط با سرور');
        setSavingPassword(false);
        return;
      }
      setSavingPassword(false);
      setOldPasswordInput('');
      setNewPasswordInput('');
    }

    if (nameInput.trim()) {
      onUpdateUser(nameInput.trim());
    }
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 dir-rtl text-slate-100">
      <div className="w-full max-w-lg bg-[#121212] border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                اطلاعات حساب کاربری
              </h2>
              <p className="text-xs text-white/50">
                مشاهده و ویرایش مشخصات، سطح اشتراک و امنیت حساب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subscription / Plan Badge */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-blue-900/30 border border-blue-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-300">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white">اشتراک ویژه زاگرس ریپوست</span>
                <span className="text-[10px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full">
                  فعال
                </span>
              </div>
              <p className="text-[11px] text-white/60 mt-0.5">
                دسترسی نامحدود به موتور هوشمند انتقال پیام و بازنویسی
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="block text-white/80 font-bold">
              نام و نام خانوادگی:
            </label>
            <div className="relative">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white focus:outline-none focus:border-blue-500"
              />
              <User className="w-4 h-4 text-white/30 absolute left-3.5 top-3" />
            </div>
          </div>

          {/* Phone Number */}
          <div className="space-y-1.5">
            <label className="block text-white/80 font-bold">
              شماره همراه:
            </label>
            <div className="relative">
              <input
                type="text"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-left font-mono-code focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              <Phone className="w-4 h-4 text-white/30 absolute left-3.5 top-3" />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-white/80 font-bold">
              رمز عبور فعلی:
            </label>
            <div className="relative">
              <input
                type="password"
                value={oldPasswordInput}
                onChange={(e) => setOldPasswordInput(e.target.value)}
                placeholder="برای تغییر رمز عبور وارد کنید"
                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white placeholder:text-white/30 text-left font-mono-code focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              <Key className="w-4 h-4 text-white/30 absolute left-3.5 top-3" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-white/80 font-bold">
              رمز عبور جدید:
            </label>
            <div className="relative">
              <input
                type="password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="خالی بگذارید تا تغییر نکند"
                className="w-full px-4 py-2.5 bg-[#0a0a0a] border border-white/15 rounded-xl text-white placeholder:text-white/30 text-left font-mono-code focus:outline-none focus:border-blue-500"
                dir="ltr"
              />
              <Key className="w-4 h-4 text-white/30 absolute left-3.5 top-3" />
            </div>
            {passwordError && (
              <p className="text-[11px] text-red-400 font-bold flex items-center gap-1.5 pt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {passwordError}
              </p>
            )}
          </div>

          {/* Additional Stats */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <div>
                <span className="block text-[10px] text-white/50">سطح دسترسی</span>
                <span className="font-bold text-white">مدیر ارشد (Admin)</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="block text-[10px] text-white/50">اعتبار حساب</span>
                <span className="font-bold text-white">۳۶۵ روز باقیمانده</span>
              </div>
            </div>
          </div>

          {/* Save buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            {isSaved ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" /> اطلاعات با موفقیت بروزرسانی شد
              </span>
            ) : (
              <span className="text-white/40">شناسه حساب: ZAGROS-88402</span>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {savingPassword ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};

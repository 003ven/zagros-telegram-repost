import React, { useEffect, useState } from 'react';
import { Radio, User, Key, Lock, Phone, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { setAuthToken } from '../lib/api';

interface LoginFormProps {
  onLoginSuccess: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  // Whether the initial system admin account has been created on the server
  const [isAdminRegistered, setIsAdminRegistered] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const [mode, setMode] = useState<'setupAdmin' | 'login' | 'forgot'>('login');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const isSetup = Boolean(data?.isSetup);
        setIsAdminRegistered(isSetup);
        setMode(isSetup ? 'login' : 'setupAdmin');
      })
      .catch(() => {
        if (!cancelled) setIsAdminRegistered(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initial Admin Registration Fields
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  // Login Fields
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot Password Fields (server-side recovery key set via ADMIN_RECOVERY_KEY env var)
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle Initial Admin Setup
  const handleSetupAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const username = adminUsername.trim();
    const password = adminPassword.trim();
    const confirm = adminConfirmPassword.trim();

    if (!username || !password || !confirm) {
      setError('لطفاً تمامی فیلدهای نام کاربری، رمز عبور و تکرار رمز عبور را وارد کنید.');
      return;
    }

    if (password.length < 4) {
      setError('رمز عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }

    if (password !== confirm) {
      setError('رمز عبور و تکرار آن یکسان نیستند. لطفاً مجدداً بررسی نمایید.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'خطا در ایجاد حساب مدیر');
        return;
      }
      setAuthToken(data.token);
      setIsAdminRegistered(true);
      onLoginSuccess();
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  // Reset Password using server-side recovery key
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!recoveryKey.trim()) {
      setError('لطفاً کلید بازیابی را وارد کنید.');
      return;
    }

    if (!newPassword.trim() || newPassword.length < 4) {
      setError('رمز عبور جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryKey: recoveryKey.trim(), newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'خطا در بازیابی رمز عبور');
        return;
      }
      setSuccessMessage('رمز عبور مدیریت با موفقیت بروزرسانی شد. اکنون می‌توانید وارد شوید.');
      setLoginPassword(newPassword);
      setMode('login');
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const inputUser = loginPhone.trim();
    const inputPass = loginPassword.trim();

    if (!inputUser || !inputPass) {
      setError('لطفاً نام کاربری و رمز عبور مدیر را وارد نمایید.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inputUser, password: inputPass }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'ورود ناموفق بود');
        return;
      }
      setAuthToken(data.token);
      onLoginSuccess();
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-[#edf2f7] flex items-center justify-center">
        <div className="text-slate-400 text-xs font-bold">در حال بررسی وضعیت سیستم...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#edf2f7] flex flex-col items-center justify-between p-4 dir-rtl font-sans antialiased text-slate-800">
      
      {/* Top Spacer */}
      <div className="w-full h-4"></div>

      {/* Main Card */}
      <div className="w-full max-w-md bg-white rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-slate-100 p-8 space-y-6 animate-fadeIn my-auto">
        
        {/* Header Icon & Title */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/30">
            <Radio className="w-10 h-10 animate-pulse" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              زاگرس ریپوست
            </h1>
            <p className="text-[11px] font-bold text-slate-400 tracking-widest font-mono-code uppercase mt-0.5">
              ZAGROS REPOST • ADMIN PANEL
            </p>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-extrabold mt-3">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>پنل اختصاصی مدیریت سیستم شخصی</span>
            </div>
          </div>
        </div>

        {/* Status / Mode Switcher */}
        {!isAdminRegistered ? (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold text-center flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>راه اندازی اولیه: ثبت نام کاربری و رمز عبور مدیر سیستم</span>
          </div>
        ) : (
          <div className="bg-[#f1f5f9] p-1.5 rounded-2xl flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-2.5 rounded-xl font-bold transition-all text-center cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ورود مدیر سیستم
            </button>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}
              className={`flex-1 py-2.5 rounded-xl font-bold transition-all text-center cursor-pointer ${
                mode === 'forgot'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              فراموشی رمز عبور
            </button>
          </div>
        )}

        {/* Error & Success Alerts */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs text-center font-medium">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs text-center font-medium leading-relaxed">
            {successMessage}
          </div>
        )}

        {/* Form Body */}
        {!isAdminRegistered ? (
          /* INITIAL ADMIN SETUP FORM */
          <form onSubmit={handleSetupAdmin} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                نام کاربری مدیر (یکبار جهت ورود)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="مثال: admin یا نام دلخواه"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10"
                  required
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                رمز عبور مدیریت
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="تعیین رمز عبور امن"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10 text-right"
                  dir="ltr"
                  required
                />
                <Key className="w-4 h-4 text-amber-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                تکرار رمز عبور مدیریت
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  placeholder="تکرار دقیق رمز عبور"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10 text-right"
                  dir="ltr"
                  required
                />
                <Lock className="w-4 h-4 text-emerald-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-6 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="w-4 h-4" />
              {loading ? 'در حال ثبت مدیر...' : 'ثبت و راه اندازی حساب مدیریت'}
            </button>
          </form>
        ) : mode === 'forgot' ? (
          /* FORGOT PASSWORD FORM — uses the server-side ADMIN_RECOVERY_KEY
             environment variable set by whoever deployed the app, since
             there's no email/SMS service available for a real reset code. */
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-[11px] text-center font-medium leading-relaxed">
              کلید بازیابی همان مقدار متغیر محیطی ADMIN_RECOVERY_KEY است که هنگام راه‌اندازی سرور تنظیم کرده‌اید.
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                کلید بازیابی سرور
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  placeholder="ADMIN_RECOVERY_KEY"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10 text-left font-mono-code"
                  dir="ltr"
                  required
                />
                <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                رمز عبور جدید مدیر
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="رمز عبور جدید خود را وارد کنید"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10 text-right"
                  dir="ltr"
                  required
                />
                <Key className="w-4 h-4 text-amber-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {loading ? 'در حال تغییر...' : 'ثبت و تغییر رمز عبور مدیر'}
            </button>
          </form>
        ) : (
          /* LOGIN FORM FOR ADMIN */
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                نام کاربری مدیر
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="نام کاربری مدیر را وارد نمایید"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10 text-right"
                  dir="ltr"
                  required
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">
                  رمز عبور
                </label>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setSuccessMessage(null); }}
                  className="text-[11px] text-blue-600 hover:underline font-bold"
                >
                  فراموشی رمز عبور؟
                </button>
              </div>
              <div className="relative">
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="رمز عبور مدیر را وارد نمایید"
                  className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all pl-10 text-right"
                  dir="ltr"
                  required
                />
                <Key className="w-4 h-4 text-amber-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-6 bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Lock className="w-4 h-4" />
              {loading ? 'در حال ورود به پنل...' : 'ورود اختصاصی مدیر سیستم'}
            </button>
          </form>
        )}

      </div>

      {/* Bottom Footer Links */}
      <footer className="w-full py-3 px-4 text-[11px] text-slate-500 bg-white/80 backdrop-blur-md border-t border-slate-200/80 mt-auto">
        <div className="max-w-md mx-auto flex items-center justify-center flex-wrap gap-2 text-center">
          <span className="font-bold text-slate-600">توسعه دهنده :</span>

          <a
            href="https://t.me/mahdi7ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 font-bold hover:bg-blue-100 transition-colors"
          >
            پیوی : mahdi7ai
          </a>

          <a
            href="https://t.me/coverbesaz"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium hover:bg-slate-200 transition-colors"
          >
            کانال تلگرام : coverbesaz
          </a>

          <a
            href="https://youtube.com/@beagoodfox"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200/60 font-medium hover:bg-red-100 transition-colors"
          >
            کانال یوتیوب : beagoodfox
          </a>
        </div>
      </footer>

    </div>
  );
};



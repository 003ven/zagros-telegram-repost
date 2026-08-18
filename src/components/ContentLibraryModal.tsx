import React, { useEffect, useState, useCallback } from 'react';
import { X, CalendarClock, Send, Trash2, Clock, CheckCircle2, AlertCircle, Ban } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { TelegramConnection, ScheduledPost } from '../types';

interface ContentLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: TelegramConnection[];
}

const STATUS_META: Record<ScheduledPost['status'], { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'در انتظار ارسال', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <Clock className="w-3.5 h-3.5" /> },
  sent: { label: 'ارسال شد', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  failed: { label: 'ناموفق', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  canceled: { label: 'لغو شده', color: 'text-white/40 bg-white/5 border-white/10', icon: <Ban className="w-3.5 h-3.5" /> },
};

/**
 * فاز ۳ب (references/roadmap.md): کتابخانه‌ی محتوا — ساخت و مدیریت
 * پست‌های متنی زمان‌بندی‌شده، مستقل از پایپ‌لاین ریپوست خودکار.
 * فقط متن پشتیبانی می‌شود (نه رسانه) در این نسخه‌ی اول.
 */
export const ContentLibraryModal: React.FC<ContentLibraryModalProps> = ({ isOpen, onClose, connections }) => {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionId, setConnectionId] = useState(connections[0]?.id || '');
  const [text, setText] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/scheduled-posts');
      const data = await res.json();
      if (data.success) setPosts(data.posts);
    } catch {
      // بی‌خطا رد شو
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchPosts();
  }, [isOpen, fetchPosts]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!connectionId) {
      setError('ابتدا یک پل بسازید — پست زمان‌بندی‌شده باید به یک پل (برای استفاده از توکن رباتش) وصل باشد.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/scheduled-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, text, scheduledAt: new Date(scheduledAt).toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        setText('');
        setScheduledAt('');
        await fetchPosts();
      } else {
        setError(data.error || 'خطا در ایجاد پست زمان‌بندی‌شده');
      }
    } catch {
      setError('خطا در ارتباط با سرور');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(`/api/scheduled-posts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) await fetchPosts();
    } catch {
      // بی‌خطا رد شو
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 dir-rtl">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#121212] border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">کتابخانه‌ی محتوا</h2>
              <p className="text-xs text-white/50">نوشتن و زمان‌بندی پست‌های متنی دستی، جدا از ریپوست خودکار</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create form */}
        <form onSubmit={handleCreate} className="space-y-3 text-xs p-4 rounded-2xl bg-[#18181b] border border-white/10">
          <div>
            <label className="block text-white/60 mb-1">ارسال از طریق پل:</label>
            <select
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs"
            >
              {connections.length === 0 && <option value="">هیچ پلی موجود نیست</option>}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.targetChannel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-white/60 mb-1">متن پست:</label>
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="متن پستی که می‌خواهید در زمان مشخص‌شده ارسال شود..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            <div>
              <label className="block text-white/60 mb-1">زمان ارسال:</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-white/15 rounded-xl text-white text-xs"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs shadow-lg shadow-teal-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              زمان‌بندی کن
            </button>
          </div>
          {error && <p className="text-red-400 text-[11px]">{error}</p>}
        </form>

        {/* List */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-white/70">پست‌های زمان‌بندی‌شده</h3>
          {loading && <p className="text-white/40 text-xs">در حال بارگذاری...</p>}
          {!loading && posts.length === 0 && (
            <p className="text-white/40 text-xs">هنوز پستی زمان‌بندی نکرده‌اید.</p>
          )}
          {posts.map((post) => {
            const meta = STATUS_META[post.status];
            return (
              <div key={post.id} className="p-3 rounded-xl bg-[#18181b] border border-white/10 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/90 line-clamp-2">{post.text}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 ${meta.color}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-white/40">
                      {new Date(post.scheduledAt).toLocaleString('fa-IR')}
                    </span>
                  </div>
                  {post.error && <p className="text-[10px] text-red-400 mt-1">{post.error}</p>}
                </div>
                {post.status === 'pending' && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { X, Eye, Users, Loader2, Send } from 'lucide-react';
import { ChannelPreviewResult } from '../types';
import { apiFetch } from '../lib/api';

interface ChannelPreviewModalProps {
  channelName: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ChannelPreviewModal: React.FC<ChannelPreviewModalProps> = ({
  channelName,
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<ChannelPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && channelName) {
      setLoading(true);
      apiFetch('/api/connections/preview-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelName }),
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) return null;
          return res.json();
        })
        .then((res) => {
          if (res && res.success) {
            setData(res.result);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOpen, channelName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#121212] rounded-2xl border border-white/10 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#18181b]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-bold">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">پیش‌نمایش کانال مبدأ</h3>
              <p className="text-xs text-white/50 font-mono-code" dir="ltr">
                {channelName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
              <div className="text-xs text-white/50 font-medium">
                در حال استخراج آخرین پست‌های منتشر شده در کانال...
              </div>
            </div>
          ) : data ? (
            <>
              {/* Channel Info Banner */}
              <div className="p-4 rounded-xl bg-[#18181b] border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {data.avatarUrl ? (
                    <img
                      src={data.avatarUrl}
                      alt={data.title}
                      className="w-11 h-11 rounded-full object-cover border border-white/10"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-orange-500 text-white font-bold text-base flex items-center justify-center">
                      {data.title.substring(0, 1)}
                    </div>
                  )}
                  <div>
                    <h4 className="font-bold text-white text-sm">{data.title}</h4>
                    <span className="text-xs text-white/40 font-mono-code" dir="ltr">
                      @{data.username}
                    </span>
                  </div>
                </div>

                {data.subscribers && (
                  <div className="flex items-center gap-1.5 text-xs text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20 font-mono-code">
                    <Users className="w-3.5 h-3.5" />
                    <span>{data.subscribers} عضو</span>
                  </div>
                )}
              </div>

              {/* Messages list */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-white/80 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-orange-500" />
                  آخرین پست‌های شناسا‌یی شده:
                </h5>

                {data.messages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-white/40 bg-[#18181b] rounded-xl border border-dashed border-white/10">
                    پستی در این کانال یافت نشد یا کانال عمومی نیست.
                  </div>
                ) : (
                  data.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-xl bg-[#18181b] border border-white/10 space-y-2 hover:border-white/20 transition-all"
                    >
                      <div className="flex items-center justify-between text-[11px] text-white/40 font-mono-code">
                        <span className="font-bold text-orange-400">پست کد #{msg.id}</span>
                        <span dir="ltr">
                          {new Date(msg.publishedAt).toLocaleTimeString('fa-IR')}
                        </span>
                      </div>

                      {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                        <div className="my-2 rounded-lg overflow-hidden max-h-52 bg-black">
                          <img
                            src={msg.mediaUrls[0]}
                            alt="Media"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {msg.text && (
                        <p className="text-xs text-white/90 whitespace-pre-line leading-relaxed font-sans dir-rtl">
                          {msg.text}
                        </p>
                      )}

                      <div className="pt-2 flex items-center gap-2 text-[10px] text-white/40 border-t border-white/5">
                        <span className="px-2 py-0.5 rounded-md bg-[#0a0a0a] border border-white/10 font-mono-code uppercase text-orange-400">
                          نوع: {msg.mediaType}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-white/40">اطلاعاتی یافت نشد.</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-[#18181b] text-left">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

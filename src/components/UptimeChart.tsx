import React from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, XAxis } from 'recharts';
import { apiFetch } from '../lib/api';

interface UptimeDataPoint {
  time: string;
  uptime: number | null;
}

/**
 * فاز ۳ب: دیگر داده‌ی pseudo-random نیست — از GET /api/uptime-history
 * می‌آید که خودش از نمونه‌های واقعی هر ۵ دقیقه (server.ts,
 * startUptimeSampler) تغذیه می‌شود. ساعت‌هایی که هنوز نمونه‌ای برایشان
 * ثبت نشده (مثلاً سرور تازه بالا آمده) با یک شکاف در نمودار نمایش داده
 * می‌شوند، نه یک عدد جعلی.
 */
export const UptimeChart: React.FC = () => {
  const [data, setData] = React.useState<UptimeDataPoint[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch('/api/uptime-history?hours=24');
        const json = await res.json();
        if (!cancelled && json.success) {
          const points: UptimeDataPoint[] = json.history.map((h: { hourStart: string; healthyPercent: number | null }) => ({
            time: `${new Date(h.hourStart).getHours().toString().padStart(2, '0')}:00`,
            uptime: h.healthyPercent,
          }));
          setData(points);
        }
      } catch {
        // بی‌خطا رد شو — نمودار فقط خالی می‌ماند تا دور بعدی.
      }
    };
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (data.length === 0) {
    return <div className="w-full h-14 mt-1.5" />;
  }

  return (
    <div className="w-full h-14 mt-1.5 dir-ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, 100]} hide />
          <XAxis dataKey="time" hide />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload as UptimeDataPoint;
                return (
                  <div className="bg-[#0b0c10] border border-emerald-500/40 px-2 py-1 rounded-lg text-[10px] text-emerald-300 shadow-lg font-mono-code flex items-center gap-1.5">
                    <span>ساعت {item.time}</span>
                    <span className="text-white font-bold">|</span>
                    <span className="font-bold">{item.uptime === null ? 'بدون داده' : `${item.uptime}٪`}</span>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="uptime"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#emeraldGradient)"
            isAnimationActive={true}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

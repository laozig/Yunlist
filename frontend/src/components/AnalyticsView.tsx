import { useEffect, useState } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area 
} from 'recharts';
import { api } from '../lib/api';
import { TrendingUp, Download, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export function AnalyticsView() {
  const [data, setData] = useState<{ dashboard: any[], hotFiles: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.getStats();
        setData(res);
      } catch (err: any) {
        setError(err.message || '获取数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">深度采集数据中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-red-50 text-red-600 p-6 rounded-2xl flex items-center gap-4 max-w-md border border-red-100">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <p className="font-medium">{error || '暂无统计数据'}</p>
        </div>
      </div>
    );
  }

  const { dashboard, hotFiles } = data;

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50/30">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">数据中心</h2>
            <p className="text-gray-500 font-medium mt-1">洞察全站文件的传播与响应趋势</p>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">实时统计已开启</span>
          </div>
        </header>

        {/* Chart Section */}
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">趋势分析 (最近14天)</h3>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dashboard}>
                <defs>
                  <linearGradient id="colorView" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDown" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                  dy={10}
                  tickFormatter={(str: any) => format(new Date(str), 'MM-dd')}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                  labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Area 
                  type="monotone" 
                  name="访问点击" 
                  dataKey="view_count" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorView)" 
                />
                <Area 
                  type="monotone" 
                  name="下载次数" 
                  dataKey="download_count" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorDown)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hot Files List */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          <div className="md:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">热门下载排行</h3>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {hotFiles.length > 0 ? hotFiles.map((file: any, idx: any) => (
                <div key={file.relative_path} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="w-6 text-sm font-black text-gray-300 italic">{idx + 1}</span>
                    <div className="max-w-[300px]">
                      <p className="text-sm font-bold text-gray-700 truncate" title={file.relative_path}>
                        {file.relative_path.split('/').pop()}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">{file.relative_path}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 font-medium">浏览</p>
                      <p className="text-sm font-black text-indigo-600 tracking-tighter">{file.views}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 font-medium">下载</p>
                      <p className="text-sm font-black text-green-600 tracking-tighter">{file.downloads}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-gray-400 italic">暂无下载记录</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
             <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-200 relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-indigo-100 text-sm font-bold uppercase tracking-wider mb-2">全站总点击</p>
                  <p className="text-4xl font-black mb-4">
                    {dashboard.reduce((acc: any, curr: any) => acc + curr.view_count, 0)}
                  </p>
                  <TrendingUp className="w-12 h-12 text-indigo-400/30 absolute top-0 right-0" />
                </div>
                <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
             </div>

             <div className="bg-green-600 p-8 rounded-3xl text-white shadow-xl shadow-green-200 relative overflow-hidden group">
                <div className="relative z-10">
                  <p className="text-green-100 text-sm font-bold uppercase tracking-wider mb-2">全站总下载</p>
                  <p className="text-4xl font-black mb-4">
                    {dashboard.reduce((acc: any, curr: any) => acc + curr.download_count, 0)}
                  </p>
                  <Download className="w-12 h-12 text-green-400/30 absolute top-0 right-0" />
                </div>
                <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

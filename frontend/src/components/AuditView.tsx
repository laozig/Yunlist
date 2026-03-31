import { useEffect, useMemo, useState } from 'react';
import { api, type AuditLogItem } from '../lib/api';
import { Search, Eye, Download, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

export function AuditView() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [eventFilter, setEventFilter] = useState<'all' | 'view' | 'download'>('all');
  const [scopeFilter, setScopeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await api.getAuditLogs({
          limit: pageSize,
          offset: (page - 1) * pageSize,
          eventType: eventFilter,
          accessScope: scopeFilter || undefined,
          keyword: keyword.trim() || undefined,
        });
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    void fetchLogs();
  }, [page, pageSize, eventFilter, scopeFilter, keyword]);

  useEffect(() => {
    setPage(1);
  }, [eventFilter, scopeFilter, keyword, pageSize]);

  const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [total, pageSize]);
  const availableScopes = useMemo(() => ['share:view', 'share:download', 'share:archive'], []);
  const viewCount = items.filter(item => item.event_type === 'view').length;
  const downloadCount = items.filter(item => item.event_type === 'download').length;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">正在加载审计日志...</div>;
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-gray-50/30">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">访问审计</h2>
            <p className="text-sm text-gray-500 mt-1">记录分享页的访问与下载行为，便于追踪分享传播情况。</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索路径、IP、UA 或范围..."
                className="w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as typeof eventFilter)}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">全部事件</option>
              <option value="view">仅访问</option>
              <option value="download">仅下载</option>
            </select>

            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="">全部范围</option>
              {availableScopes.map((scope) => (
                <option key={scope} value={scope}>{scope}</option>
              ))}
            </select>

            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
            >
              <option value={20}>每页 20 条</option>
              <option value={50}>每页 50 条</option>
              <option value={100}>每页 100 条</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">总事件</p>
            <p className="text-3xl font-black text-gray-800 mt-2">{items.length}</p>
          </div>
          <div className="rounded-3xl bg-sky-50 border border-sky-100 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wider text-sky-500 font-bold">访问</p>
            <p className="text-3xl font-black text-sky-700 mt-2">{viewCount}</p>
          </div>
          <div className="rounded-3xl bg-emerald-50 border border-emerald-100 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wider text-emerald-500 font-bold">下载</p>
            <p className="text-3xl font-black text-emerald-700 mt-2">{downloadCount}</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 text-gray-700 font-semibold">
            <ShieldCheck className="w-4 h-4 text-indigo-500" /> 最近访问日志
          </div>

          {items.length === 0 ? (
            <div className="py-20 text-center text-gray-400">暂无符合条件的审计日志。</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div key={`${item.id ?? item.created_at}-${item.relative_path}`} className="px-6 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 hover:bg-gray-50/60 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${item.event_type === 'download' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
                        {item.event_type === 'download' ? <Download className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {item.event_type === 'download' ? '下载' : '访问'}
                      </span>
                      {item.access_scope && <span className="text-xs text-gray-400 font-medium">{item.access_scope}</span>}
                    </div>
                    <p className="mt-2 font-semibold text-gray-800 truncate">{item.title || item.relative_path.split('/').pop() || item.relative_path}</p>
                    <p className="text-xs text-gray-500 mt-1 break-all">/{item.relative_path}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-500 min-w-[320px]">
                    <div>
                      <p className="text-gray-400 uppercase tracking-wider mb-1">来源 IP</p>
                      <p className="font-medium text-gray-700 break-all">{item.ip_address || '未知'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase tracking-wider mb-1">User-Agent</p>
                      <p className="font-medium text-gray-700 line-clamp-2">{item.user_agent || '未知'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase tracking-wider mb-1">发生时间</p>
                      <p className="font-medium text-gray-700">{item.created_at ? format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss') : '未知'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50/60">
            <p className="text-sm text-gray-500">第 {page} / {totalPages} 页，共 {total} 条日志</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1}
                className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page >= totalPages}
                className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
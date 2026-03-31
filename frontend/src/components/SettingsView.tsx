import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { api, type SystemStats } from '../lib/api';
import {
  Activity,
  Boxes,
  Clock3,
  Cpu,
  Database,
  FolderOpen,
  Globe,
  HardDrive,
  PackageCheck,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / Math.pow(1024, index);

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '刚刚启动';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '未知';
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function getDbHealthMeta(status: SystemStats['dbHealth']['status']) {
  switch (status) {
    case 'healthy':
      return {
        badge: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        dot: 'bg-emerald-500',
      };
    case 'warning':
      return {
        badge: 'bg-amber-50 text-amber-700 border-amber-100',
        dot: 'bg-amber-500',
      };
    default:
      return {
        badge: 'bg-rose-50 text-rose-600 border-rose-100',
        dot: 'bg-rose-500',
      };
  }
}

function getModeMeta(mode: SystemStats['deploymentMode']) {
  switch (mode) {
    case 'docker':
      return {
        label: 'Docker 容器',
        hint: '隔离运行',
        tone: 'bg-sky-50 text-sky-600 border-sky-100',
      };
    case 'pm2':
      return {
        label: 'PM2 宿主机',
        hint: '原生部署',
        tone: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      };
    default:
      return {
        label: 'Node 进程',
        hint: '开发 / 手动运行',
        tone: 'bg-amber-50 text-amber-700 border-amber-100',
      };
  }
}

export function SettingsView() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await api.getSystemStats();
      setStats(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const refreshStats = async () => {
    setIsRefreshing(true);
    await fetchStats();
    setIsRefreshing(false);
  };

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
        <p className="font-medium animate-pulse">正在获取后台系统状态...</p>
      </div>
    );
  }

  const modeMeta = getModeMeta(stats.deploymentMode);
  const appMemoryPercent = Math.min((stats.memoryUsage.heapUsed / Math.max(stats.memoryUsage.heapTotal, 1)) * 100, 100);
  const systemMemoryPercent = Math.min((stats.systemMemory.used / Math.max(stats.systemMemory.total, 1)) * 100, 100);
  const rootStatusTone = stats.rootExists ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
  const dbStatusTone = stats.dbExists ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
  const distStatusTone = stats.frontendIndexExists ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50';
  const dbHealthMeta = getDbHealthMeta(stats.dbHealth.status);
  const diskUsagePercent = stats.disk.usagePercent ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1480px] px-8 py-8">
      <div className="mb-8 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-800 tracking-tight">系统设置</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
            把这台 Yunlist 实例的运行状态、部署方式、路径配置与业务概况集中展示出来，方便你一眼判断它是不是健康、是不是跑在正确模式下。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${modeMeta.tone}`}>
              <span className="w-2 h-2 rounded-full bg-current opacity-70" />
              当前部署：{modeMeta.label}
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${dbHealthMeta.badge}`}>
              <span className={`w-2 h-2 rounded-full ${dbHealthMeta.dot}`} />
              {stats.dbHealth.label}
            </div>
          </div>
        </div>

        <button
          onClick={refreshStats}
          disabled={isRefreshing}
          className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white/80 border border-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-white disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          刷新状态
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-indigo-700 text-white p-6 shadow-xl shadow-indigo-200/40">
          <div className="flex items-center gap-3 text-indigo-200 mb-6">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs font-bold tracking-[0.25em] uppercase">部署模式</span>
          </div>
          <div className="text-3xl font-black tracking-tight">{modeMeta.label}</div>
          <div className="mt-3 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-indigo-100">
            {modeMeta.hint}
          </div>
        </div>

        <div className="rounded-3xl bg-white/80 backdrop-blur-sm border border-white/60 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-indigo-500 mb-5">
            <PackageCheck className="w-5 h-5" />
            <span className="text-xs font-bold tracking-[0.25em] uppercase">版本信息</span>
          </div>
          <div className="text-3xl font-black text-gray-800">v{stats.appVersion}</div>
          <p className="text-sm text-gray-500 mt-2">Node {stats.nodeVersion} · {stats.runtime.env}</p>
          <div className="mt-4 text-xs text-gray-400">当前进程 PID：{stats.pid}</div>
        </div>

        <div className="rounded-3xl bg-white/80 backdrop-blur-sm border border-white/60 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-indigo-500 mb-5">
            <Boxes className="w-5 h-5" />
            <span className="text-xs font-bold tracking-[0.25em] uppercase">业务概况</span>
          </div>
          <div className="text-3xl font-black text-gray-800">{stats.counters.sharedCount}</div>
          <p className="text-sm text-gray-500 mt-2">公开分享项目</p>
          <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
            <Trash2 className="w-4 h-4 text-amber-500" /> 回收站 {stats.counters.trashCount} 项
          </div>
        </div>

        <div className="rounded-3xl bg-white/80 backdrop-blur-sm border border-white/60 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-indigo-500 mb-5">
            <Activity className="w-5 h-5" />
            <span className="text-xs font-bold tracking-[0.25em] uppercase">近期活动</span>
          </div>
          <div className="text-3xl font-black text-gray-800">{stats.counters.recentActivity}</div>
          <p className="text-sm text-gray-500 mt-2">近 {stats.counters.auditEventDays} 天访问 / 下载事件</p>
          <div className={`mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${modeMeta.tone}`}>
            端口 {stats.runtime.port}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-6 items-start">
        <div className="bg-white/85 backdrop-blur-sm border border-white/60 p-6 rounded-3xl shadow-sm space-y-5 2xl:col-span-4">
          <div className="flex items-center gap-3 text-indigo-500 mb-1">
            <Server className="w-6 h-6" />
            <h3 className="font-bold text-gray-800 text-lg">运行环境</h3>
          </div>

          {[
            ['主机名', stats.hostname],
            ['操作系统', `${stats.platform.toUpperCase()} · ${stats.arch}`],
            ['Node 版本', stats.nodeVersion],
            ['工作目录', stats.cwd],
            ['Caddy 域名', stats.runtime.caddyDomain || '未配置'],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-2 py-2 border-b border-gray-100 last:border-b-0">
              <span className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400">{label}</span>
              <span className="text-sm break-all font-mono text-gray-700">{value}</span>
            </div>
          ))}

          <div className="rounded-2xl bg-gradient-to-r from-indigo-50 to-fuchsia-50 border border-indigo-100 p-4 flex flex-wrap gap-3 items-center justify-between">
            <div>
              <div className="text-xs font-bold tracking-[0.2em] uppercase text-indigo-400">进程状态</div>
              <div className="text-lg font-black text-gray-800 mt-1">
                {stats.runtime.pm2Id != null ? `PM2 #${stats.runtime.pm2Id}` : 'Standalone Process'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">应用已运行</div>
              <div className="text-base font-bold text-indigo-600">{formatDuration(stats.uptime)}</div>
            </div>
          </div>
        </div>

        <div className="bg-white/85 backdrop-blur-sm border border-white/60 p-6 rounded-3xl shadow-sm space-y-5 2xl:col-span-4">
          <div className="flex items-center gap-3 text-indigo-500 mb-1">
            <HardDrive className="w-6 h-6" />
            <h3 className="font-bold text-gray-800 text-lg">存储与路径</h3>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400">资源根目录</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${rootStatusTone}`}>{stats.rootExists ? '已就绪' : '不存在'}</span>
              </div>
              <div className="text-sm break-all font-mono text-gray-700 bg-gray-50 p-3 rounded-2xl border border-gray-100">{stats.rootPath}</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400">SQLite 数据库</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${dbStatusTone}`}>{stats.dbExists ? formatBytes(stats.dbSize) : '未检测到'}</span>
              </div>
              <div className="text-sm break-all font-mono text-gray-700 bg-gray-50 p-3 rounded-2xl border border-gray-100">{stats.dbPath}</div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400">前端打包目录</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${distStatusTone}`}>{stats.frontendIndexExists ? 'index 已就绪' : '缺少 index.html'}</span>
              </div>
              <div className="text-sm break-all font-mono text-gray-700 bg-gray-50 p-3 rounded-2xl border border-gray-100">{stats.frontendDistPath}</div>
            </div>
          </div>
        </div>

        <div className="bg-white/85 backdrop-blur-sm border border-white/60 p-6 rounded-3xl shadow-sm space-y-6 2xl:col-span-4">
          <div className="flex items-center gap-3 text-indigo-500">
            <Cpu className="w-6 h-6" />
            <h3 className="font-bold text-gray-800 text-lg">资源监控</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">进程 RSS</div>
              <div className="text-2xl font-black text-gray-800">{formatBytes(stats.memoryUsage.rss)}</div>
              <div className="text-xs text-gray-500 mt-2">进程整体常驻内存</div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">数据库体积</div>
              <div className="text-2xl font-black text-gray-800">{formatBytes(stats.dbSize)}</div>
              <div className="text-xs text-gray-500 mt-2">当前 SQLite 文件大小</div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">磁盘占用</div>
              <div className="text-2xl font-black text-gray-800">{formatPercent(stats.disk.usagePercent)}</div>
              <div className="text-xs text-gray-500 mt-2">{stats.disk.used != null && stats.disk.total != null ? `${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}` : '当前环境暂未提供磁盘统计'}</div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">CPU 信息</div>
              <div className="text-2xl font-black text-gray-800">{stats.cpu.cores} 核</div>
              <div className="text-xs text-gray-500 mt-2 line-clamp-2">{stats.cpu.model}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-gray-600">Node 堆内存</span>
              <span className="font-mono text-gray-500">{formatBytes(stats.memoryUsage.heapUsed)} / {formatBytes(stats.memoryUsage.heapTotal)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full" style={{ width: `${appMemoryPercent}%` }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-gray-600">系统内存</span>
              <span className="font-mono text-gray-500">{formatBytes(stats.systemMemory.used)} / {formatBytes(stats.systemMemory.total)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-500 to-cyan-500 rounded-full" style={{ width: `${systemMemoryPercent}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">External</div>
              <div className="font-black text-lg text-gray-800">{formatBytes(stats.memoryUsage.external)}</div>
            </div>
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400 mb-2">Load Avg</div>
              <div className="font-black text-lg text-gray-800">{stats.cpu.loadavg.map((item) => item.toFixed(2)).join(' / ')}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-gray-600">磁盘空间</span>
              <span className="font-mono text-gray-500">{stats.disk.used != null && stats.disk.total != null ? `${formatBytes(stats.disk.used)} / ${formatBytes(stats.disk.total)}` : '未知'}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full" style={{ width: `${diskUsagePercent}%` }} />
            </div>
          </div>
        </div>

        <div className="bg-white/85 backdrop-blur-sm border border-white/60 p-6 rounded-3xl shadow-sm space-y-5 2xl:col-span-12">
          <div className="flex items-center gap-3 text-indigo-500">
            <Zap className="w-6 h-6" />
            <h3 className="font-bold text-gray-800 text-lg">控制台摘要</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white p-5">
              <div className="flex items-center gap-2 text-indigo-100 text-xs uppercase tracking-[0.2em] font-bold">
                <Clock3 className="w-4 h-4" /> 启动时间
              </div>
              <div className="mt-3 text-xl font-black">{formatDistanceToNow(new Date(stats.runtime.startedAt), { addSuffix: true })}</div>
              <div className="mt-2 text-xs text-indigo-100/80">系统运行 {formatDuration(stats.osUptime)}</div>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-5">
              <div className="flex items-center gap-2 text-slate-300 text-xs uppercase tracking-[0.2em] font-bold">
                <Globe className="w-4 h-4" /> 访问提示
              </div>
              <div className="mt-3 text-xl font-black">{stats.runtime.caddyDomain || '未配置域名'}</div>
              <div className="mt-2 text-xs text-slate-300/80">未配置时将以本机端口 {stats.runtime.port} 提供服务</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold mb-2">
                <Database className="w-4 h-4" /> 数据状态
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2.5 h-2.5 rounded-full ${dbHealthMeta.dot}`} />
                <div className="text-lg font-black text-gray-800">{stats.dbHealth.label}</div>
              </div>
              <div className="text-xs text-gray-500 mt-2">当前路径：{stats.dbPath}</div>
              <div className="text-xs mt-2 text-gray-500">{stats.dbHealth.message}</div>
              <div className="text-[11px] mt-2 text-gray-400">Journal Mode：{stats.dbHealth.journalMode || '未知'}{stats.dbHealth.updatedAt ? ` · 最近修改 ${formatDistanceToNow(new Date(stats.dbHealth.updatedAt), { addSuffix: true })}` : ''}</div>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-[0.2em] font-bold mb-2">
                <FolderOpen className="w-4 h-4" /> 文件根目录
              </div>
              <div className="text-lg font-black text-gray-800">{stats.rootExists ? '目录可用' : '目录缺失'}</div>
              <div className="text-xs text-gray-500 mt-2">当前路径：{stats.rootPath}</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] font-bold text-gray-400">最近访问趋势</div>
                <div className="text-sm font-semibold text-gray-700 mt-1">近 {stats.counters.auditEventDays} 天访问 / 下载迷你图</div>
              </div>
              <div className="text-xs text-gray-400 font-mono">总计 {stats.counters.recentActivity}</div>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.activityTrend}>
                  <defs>
                    <linearGradient id="settingsViewTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(value: string) => value.slice(5)} />
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(label) => `日期：${label}`}
                  />
                  <Area type="monotone" name="总事件" dataKey="total" stroke="#6366f1" strokeWidth={3} fill="url(#settingsViewTrend)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/70 p-5">
            <div className="flex items-center gap-2 text-indigo-600 font-bold mb-3">
              <FolderOpen className="w-4 h-4" /> 建议关注
            </div>
            <ul className="space-y-2 text-sm text-gray-600 leading-relaxed">
              <li>• 如果数据库状态显示“未检测到”，请检查 `DB_PATH` 是否正确且宿主机目录已挂载。</li>
              <li>• 如果前端打包目录缺少 `index.html`，生产环境首页会无法正常渲染。</li>
              <li>• 若你是 PM2 原生部署，建议同时确认 `CADDY_DOMAIN` 与 `CADDY_EMAIL` 已配置。</li>
              <li>• 当磁盘占用接近上限时，优先清理大文件、回收站与旧日志，避免上传失败。</li>
              <li>• 当近期活动突然激增时，优先去“访问审计”里核查来源与行为模式。</li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
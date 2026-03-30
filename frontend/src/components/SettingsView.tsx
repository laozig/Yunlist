import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Server, Cpu, HardDrive, PackageCheck, Zap } from 'lucide-react';

export function SettingsView() {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading || !stats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin" />
        <p className="font-medium animate-pulse">正在获取后台系统状态...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 max-w-4xl overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">系统设置</h2>
        <p className="text-sm text-gray-500 mt-1">查看服务器运行概览与网盘核心环境参数。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Stats Grid */}
        <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-6 rounded-3xl shadow-sm space-y-4">
           <div className="flex items-center gap-3 text-indigo-500 mb-6">
             <Server className="w-6 h-6" />
             <h3 className="font-bold text-gray-800">环境概览</h3>
           </div>
           
           <div className="flex justify-between items-center text-sm py-2 group">
              <span className="text-gray-400 font-medium">操作系统</span>
              <span className="text-gray-800 font-mono font-semibold bg-gray-50 px-2 py-0.5 rounded border border-gray-100 group-hover:bg-gray-100 group-hover:text-indigo-600 transition tracking-tighter uppercase">{stats.platform}</span>
           </div>
           <div className="flex justify-between items-center text-sm py-2 group">
              <span className="text-gray-400 font-medium">Node 版本</span>
              <span className="text-gray-800 font-mono font-semibold bg-gray-50 px-2 py-0.5 rounded border border-gray-100 group-hover:bg-gray-100 group-hover:text-indigo-600 transition tracking-tighter">{stats.nodeVersion}</span>
           </div>
           <div className="flex justify-between items-center text-sm py-2 group">
              <span className="text-gray-400 font-medium">运行时间</span>
              <span className="text-gray-800 font-mono font-semibold bg-gray-50 px-2 py-0.5 rounded border border-gray-100 group-hover:bg-gray-100 group-hover:text-indigo-600 transition tracking-tighter">{(stats.uptime / 3600).toFixed(2)} 小时</span>
           </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-white/50 p-6 rounded-3xl shadow-sm space-y-4">
           <div className="flex items-center gap-3 text-indigo-500 mb-6">
             <HardDrive className="w-6 h-6" />
             <h3 className="font-bold text-gray-800">存储配置</h3>
           </div>
           
           <div className="flex flex-col gap-1.5 py-1">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-400">资源根目录 (ROOT)</span>
              <span className="text-sm break-all font-mono text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">{stats.rootPath}</span>
           </div>
           <p className="text-xs text-gray-400 leading-relaxed italic">*该路径无法通过网页修改，请通过服务器环境变量 `FILES_ROOT` 变更。</p>
        </div>

        {/* Resources Usage */}
        <div className="md:col-span-2 bg-gradient-to-br from-gray-900 to-indigo-900 text-white p-8 rounded-3xl shadow-xl shadow-indigo-100/50 relative overflow-hidden group">
           <Zap className="absolute top-0 right-0 w-64 h-64 text-white/5 -mr-16 -mt-16 group-hover:text-indigo-400/10 transition-colors duration-700" />
           <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-indigo-300">
                    <Cpu className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-[0.2em]">系统内存</span>
                 </div>
                 <p className="text-2xl font-black font-mono">{(stats.memoryUsage.rss / 1024 / 1024).toFixed(1)} <span className="text-sm font-normal text-indigo-300">MB</span></p>
              </div>
              <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-indigo-300">
                    <PackageCheck className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-[0.2em]">版本号</span>
                 </div>
                 <p className="text-2xl font-black font-mono">1.0.2 <span className="text-sm font-normal text-indigo-300">Stable</span></p>
              </div>
              <div className="flex flex-col gap-2">
                 <div className="flex items-center gap-2 text-indigo-300">
                    <HardDrive className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-[0.2em]">当前分支</span>
                 </div>
                 <p className="text-2xl font-black font-mono">Master <span className="text-sm font-normal text-indigo-300">Mainline</span></p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

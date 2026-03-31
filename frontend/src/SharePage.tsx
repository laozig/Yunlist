import { Fragment, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, Lock, FileBadge, ChevronRight, Home, ArrowLeft } from 'lucide-react';
import { cn } from './lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ShareChild {
  name: string;
  size: number;
  isDirectory: boolean;
  updated_at: string;
  relPath: string; // 后端返回的相对于分享根目录的路径
}

interface ShareInfo {
  id: string; // share id
  name: string;
  size: number;
  isDirectory?: boolean;
  children?: ShareChild[];
  currentPath: string;
  title?: string | null;
  description?: string | null;
  needsPassword?: boolean;
  updated_at?: string;
  expiresAt?: string | null;
  maxViews?: number | null;
  maxDownloads?: number | null;
  views?: number;
  downloads?: number;
  remainingViews?: number | null;
  remainingDownloads?: number | null;
}

function normalizeShareInfo(payload: any): ShareInfo {
  const file = payload?.file ?? {};
  const meta = payload?.meta ?? {};
  const children = (payload?.children ?? file?.children ?? []).map((child: any) => ({
    ...child,
    relPath: child.relPath ?? child.relativePath ?? '',
    updated_at: child.updated_at ?? new Date().toISOString(),
  }));

  return {
    id: payload?.id ?? meta?.share_id ?? '',
    name: payload?.name ?? file?.name ?? '',
    size: payload?.size ?? file?.size ?? 0,
    isDirectory: payload?.isDirectory ?? file?.isDirectory ?? false,
    children,
    currentPath: payload?.currentPath ?? '',
    title: payload?.title ?? meta?.title ?? null,
    description: payload?.description ?? meta?.description ?? null,
    needsPassword: payload?.needsPassword ?? !!meta?.access_password,
    updated_at: payload?.updated_at,
    expiresAt: payload?.expiresAt ?? null,
    maxViews: payload?.maxViews ?? null,
    maxDownloads: payload?.maxDownloads ?? null,
    views: payload?.views ?? 0,
    downloads: payload?.downloads ?? 0,
    remainingViews: payload?.remainingViews ?? null,
    remainingDownloads: payload?.remainingDownloads ?? null,
  };
}

export function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const subPath = searchParams.get('p') || '';
  
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'file' | 'archive'>('file');
  
  // 当前选中的待下载文件 (针对文件夹中的单个文件)
  const [targetFile, setTargetFile] = useState<ShareChild | null>(null);

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setTargetFile(null);
    setPendingAction('file');
    setDownloadError('');
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/share/${id}?p=${encodeURIComponent(subPath)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || '加载分享信息失败');
        return data;
      })
      .then(data => {
        setInfo(normalizeShareInfo(data));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, subPath]);

  const handleDownload = async (fileToDownload?: ShareChild) => {
    // 如果没有传入文件，且当前是目录，则不支持直接下载整个目录
    if (!fileToDownload && info?.isDirectory && !targetFile) return;

    const finalTarget = fileToDownload || targetFile || null;
    const downloadPath = finalTarget ? finalTarget.relPath : (!info?.isDirectory ? info?.currentPath || '' : '');

    if (info?.needsPassword && !password) {
      if (finalTarget) setTargetFile(finalTarget);
      setPendingAction('file');
      setShowPasswordModal(true);
      return;
    }

    setIsDownloading(true);
    setDownloadError('');
    try {
      const res = await fetch(`/api/share/${id}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password: password || undefined,
          p: downloadPath
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to download');
      }

      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = finalTarget ? finalTarget.name : info?.name || 'download';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^" ;]+)"?/);
        if (match && match[1]) filename = decodeURIComponent(match[1]);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setShowPasswordModal(false);
      setPassword('');
      setTargetFile(null);
      setPendingAction('file');
    } catch (err: any) {
      setDownloadError(err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleArchiveDownload = async () => {
    if (!info) return;

    if (info.needsPassword && !password) {
      setTargetFile(null);
      setPendingAction('archive');
      setShowPasswordModal(true);
      return;
    }

    setIsDownloading(true);
    setDownloadError('');
    try {
      const res = await fetch(`/api/share/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: password || undefined,
          p: info.currentPath || ''
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to download archive');
      }

      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = `${info.name}.zip`;
      if (contentDisposition) {
        const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
        const fallbackMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
        if (utf8Match?.[1]) filename = decodeURIComponent(utf8Match[1]);
        else if (fallbackMatch?.[1]) filename = decodeURIComponent(fallbackMatch[1]);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowPasswordModal(false);
      setPassword('');
      setTargetFile(null);
      setPendingAction('file');
    } catch (err: any) {
      setDownloadError(err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleItemClick = (item: ShareChild) => {
    if (item.isDirectory) {
      setSearchParams({ p: item.relPath });
    } else {
      handleDownload(item);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (item?: any) => {
    const target = item || info;
    if (target?.isDirectory) return <div className="text-4xl">📁</div>;
    
    const ext = target?.name.split('.').pop()?.toLowerCase();
    const iconClass = "w-10 h-10";
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <div className="text-4xl">🖼️</div>;
    if (['pdf'].includes(ext || '')) return <div className="text-4xl">📕</div>;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return <div className="text-4xl">📦</div>;
    return <FileBadge className={cn(iconClass, "text-indigo-500")} />;
  };

  if (loading && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50/50">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/50 p-6 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4 text-4xl">
          ⚠️
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">访问出错</h1>
        <p className="text-gray-500">{error || '该分享链接可能已过期或已被管理员移除。'}</p>
        <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-xl">重试</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/30 selection:bg-indigo-100 selection:text-indigo-900 font-sans pb-32">
      {/* 顶部导航 */}
      <header className="relative w-full bg-white border-b border-gray-200/50 pt-12 pb-10 px-6 lg:px-8 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-[300px] bg-indigo-50/40 rounded-full blur-3xl -z-10" />

        <div className="w-20 h-20 bg-white shadow-xl shadow-indigo-100/50 rounded-2xl border border-gray-100 flex items-center justify-center mb-6 transition-transform hover:scale-105 duration-500">
           {getFileIcon()}
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-3 px-4 truncate max-w-full">
          {info.title || info.name}
        </h1>
        
        {/* 面包屑导航仅在“目录分享”时显示；单文件分享不展示“根目录”概念 */}
        {info.isDirectory && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-400">
             <button onClick={() => setSearchParams({})} className={cn("flex items-center gap-1 hover:text-indigo-600 transition-colors", !subPath && "text-slate-600 font-bold pointer-events-none")}>
               <Home className="w-4 h-4" /> 根目录
             </button>
             {subPath.split('/').filter(Boolean).map((part, i, arr) => (
               <Fragment key={i}>
                  <ChevronRight className="w-3.5 h-3.5 opacity-30" />
                  <button 
                    onClick={() => setSearchParams({ p: arr.slice(0, i + 1).join('/') })}
                    className={cn("hover:text-indigo-600 transition-colors", i === arr.length - 1 && "text-indigo-600 font-bold")}
                  >
                    {part}
                  </button>
               </Fragment>
             ))}
          </div>
        )}
      </header>

      {/* 中心内容区 */}
      <main className="max-w-4xl mx-auto px-6 lg:px-8 py-8 md:py-12 flex flex-col">
         <div className="mb-8 flex flex-wrap gap-3">
            {info.expiresAt && (
              <div className="px-4 py-2 rounded-2xl bg-rose-50 text-rose-600 text-sm font-semibold border border-rose-100">
                分享有效期至 {formatDistanceToNow(new Date(info.expiresAt), { addSuffix: true })}
              </div>
            )}
            {info.maxViews != null && (
              <div className="px-4 py-2 rounded-2xl bg-sky-50 text-sky-600 text-sm font-semibold border border-sky-100">
                访问 {info.views ?? 0} / {info.maxViews} {info.remainingViews != null ? `（剩余 ${info.remainingViews}）` : ''}
              </div>
            )}
            {info.maxDownloads != null && (
              <div className="px-4 py-2 rounded-2xl bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-100">
                下载 {info.downloads ?? 0} / {info.maxDownloads} {info.remainingDownloads != null ? `（剩余 ${info.remainingDownloads}）` : ''}
              </div>
            )}
         </div>

         {/* 描述信息 (仅在根目录显示) */}
         {!subPath && info.description && (
            <article className="prose prose-slate prose-lg max-w-none mb-12 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {info.description}
              </ReactMarkdown>
            </article>
         )}

         {/* 文件夹内容列表 */}
         {info.isDirectory && (
           <div className="space-y-4">
             <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-indigo-500 rounded-full" />
                  <h3 className="text-lg font-bold text-slate-800">
                    {subPath ? '当前目录' : '包含项目'} ({info.children?.length || 0})
                  </h3>
                </div>
                {subPath && (
                  <button 
                    onClick={() => {
                      const parts = subPath.split('/').filter(Boolean);
                      parts.pop();
                      setSearchParams(parts.length ? { p: parts.join('/') } : {});
                    }}
                    className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:bg-white px-3 py-1.5 rounded-lg transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" /> 返回上一级
                  </button>
                )}
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               {info.children && info.children.length > 0 ? info.children.map(child => (
                 <button 
                   key={child.name} 
                   onClick={() => handleItemClick(child)}
                   className="group text-left p-4 bg-white border border-slate-100 rounded-2xl flex items-center gap-4 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 transition-all active:scale-[0.98]"
                 >
                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                       <div className="scale-75">{getFileIcon(child)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className="text-sm font-bold text-slate-700 truncate" title={child.name}>{child.name}</p>
                       <p className="text-[10px] font-medium text-slate-400">
                         {child.isDirectory ? '文件夹' : formatSize(child.size)} • {formatDistanceToNow(new Date(child.updated_at))} 前
                       </p>
                    </div>
                 </button>
               )) : (
                 <div className="col-span-full py-16 text-center text-slate-300 font-medium border-2 border-dashed border-slate-100 rounded-3xl bg-white/50">
                   此文件夹内暂无可见内容。
                 </div>
               )}
             </div>
           </div>
         )}

         {!info.isDirectory && !info.description && (
            <div className="py-20 text-center text-slate-400 italic font-medium bg-white rounded-3xl border border-slate-100 shadow-sm">
              管理员未提供更多描述。
            </div>
         )}
      </main>

      {/* 底部悬浮操作区 */}
      <div className="fixed bottom-0 left-0 w-full p-4 lg:p-8 flex justify-center z-40 pointer-events-none">
         <div className="pointer-events-auto w-full max-w-md bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl shadow-indigo-500/10 rounded-2xl p-2 flex items-center gap-3 transition-all duration-300">
            <div className="flex-1 min-w-0 pl-4 py-2 flex flex-col justify-center">
              <p className="text-sm font-bold text-slate-800 truncate">{info.name}</p>
              <p className="text-xs font-medium text-slate-500">
                {info.isDirectory ? (subPath ? `浏览子目录: ${subPath.split('/').pop()}` : '共享文件夹') : formatSize(info.size)}
              </p>
            </div>
            {!info.isDirectory && (
              <button 
                onClick={() => handleDownload()}
                disabled={loading || isDownloading}
                className="group shrink-0 relative bg-indigo-600 text-white font-semibold flex items-center justify-center gap-2 h-14 px-8 rounded-xl shadow-md hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {isDownloading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download className="w-5 h-5" />}
                <span className="hidden sm:inline">立即下载</span>
              </button>
            )}
            {info.isDirectory && (
               <div className="flex items-center gap-2 pr-2">
                 <button
                   onClick={handleArchiveDownload}
                   disabled={isDownloading}
                   className="group shrink-0 relative bg-emerald-600 text-white font-semibold flex items-center justify-center gap-2 h-14 px-6 rounded-xl shadow-md hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50"
                 >
                   {isDownloading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download className="w-5 h-5" />}
                   <span className="hidden sm:inline">打包下载</span>
                 </button>
                 <div className="px-4 py-2 text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-lg max-w-[120px] text-center leading-tight">
                   点击列表项目<br/>直接漫游分享
                 </div>
               </div>
            )}
         </div>
      </div>

      {/* 密码模态框 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => !isDownloading && closePasswordModal()} />
           
           <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-6">
                 <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight mb-2">需要访问权限</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">此分享受密码保护。请输入提取码以继续：</p>
              
              {downloadError && (
                <div className="text-xs font-semibold text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-4 text-center">
                   密码错误或权限验证失败
                </div>
              )}

              <input
                type="password"
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="输入密码..."
                className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 outline-none transition-all duration-200 text-center font-bold tracking-widest"
                onKeyDown={e => { 
                  if (e.key === 'Enter' && password) {
                    pendingAction === 'archive' ? handleArchiveDownload() : handleDownload();
                  }
                }}
              />

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={closePasswordModal}
                  disabled={isDownloading}
                  className="flex-1 h-12 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                >
                  取消
                </button>
                <button 
                  onClick={() => pendingAction === 'archive' ? handleArchiveDownload() : handleDownload()}
                  disabled={!password || isDownloading}
                  className="flex-1 h-12 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                >
                  {isDownloading ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '确定'}
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

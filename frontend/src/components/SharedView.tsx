import { useState, useEffect } from 'react';
import { api, triggerBlobDownload } from '../lib/api';
import { Link2, Trash2, ExternalLink, ShieldCheck, Download, Copy, Check, CalendarClock, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { ShareQrModal } from './ShareQrModal';

export function SharedView() {
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrTarget, setQrTarget] = useState<{ title: string; url: string } | null>(null);

  const fetchShared = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSharedFiles();
      setFiles(res.files);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShared();
  }, []);

  const getShareToken = (file: any) => file.share_id || btoa(encodeURIComponent(file.relative_path));

  const handleCopy = (file: any) => {
    const url = `${window.location.origin}/share/${getShareToken(file)}`;
    navigator.clipboard.writeText(url);
    setCopiedId(file.relative_path);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUnshare = async (path: string) => {
    if (!confirm('确定要取消分享该文件吗？管理后台保留文件，但公开链接将失效。')) return;
    try {
      await api.updateMeta({ relativePath: path, isPublic: false });
      fetchShared();
    } catch (err) {
      alert('取消分享失败');
    }
  };

  const handleArchiveDownload = async (file: any) => {
    try {
      const response = await api.downloadArchive(file.relative_path, file.title || file.relative_path.split('/').pop());
      triggerBlobDownload(response.blob, response.filename);
    } catch (err: any) {
      alert(err.message || '打包下载失败');
    }
  };

  const handleShowQr = (file: any) => {
    setQrTarget({
      title: file.title || file.relative_path.split('/').pop() || file.relative_path,
      url: `${window.location.origin}/share/${getShareToken(file)}`,
    });
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center animate-pulse text-gray-400">正在加载已分享内容...</div>;
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50/30">
      <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">已分享文件</h2>
        <p className="text-sm text-gray-500 mt-1">管理全站范围内所有已开启公开访问的文件。</p>
      </div>

      {files.length === 0 ? (
        <div className="py-20 text-center bg-white/40 rounded-3xl border border-dashed border-gray-300">
           <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
           <p className="text-gray-400 font-medium">暂无已分享的文件</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {files.map((file) => (
            <div key={file.relative_path} className="bg-white/80 backdrop-blur-sm border border-white/50 p-4 sm:p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 group">
               <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                  <Download className="w-6 h-6" />
               </div>
               <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 truncate">{file.title || file.relative_path.split('/').pop()}</h3>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-gray-400 font-medium">
                     <span>{file.relative_path}</span>
                     {file.access_password && <span className="flex items-center gap-1 text-amber-500"><ShieldCheck className="w-3 h-3" /> 加密</span>}
                     {file.expires_at && <span className="flex items-center gap-1 text-rose-500"><CalendarClock className="w-3 h-3" /> 限时</span>}
                     {file.max_views != null && <span className="flex items-center gap-1 text-sky-500"><Eye className="w-3 h-3" /> 限访问 {file.max_views}</span>}
                     <span>更新于 {file.updated_at ? format(new Date(file.updated_at), 'yyyy-MM-dd HH:mm') : '未知'}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3 text-[11px] font-semibold text-gray-500">
                    <span className="px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100">访问 {file.views ?? 0}</span>
                    <span className="px-2.5 py-1 rounded-full bg-gray-50 border border-gray-100">下载 {file.downloads ?? 0}</span>
                    {file.max_downloads != null && <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">下载上限 {file.max_downloads}</span>}
                  </div>
               </div>
               <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleArchiveDownload(file)}
                    className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition"
                    title="打包下载"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleCopy(file)}
                    className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition"
                    title="复制分享链接"
                   >
                    {copiedId === file.relative_path ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                  <button 
                    onClick={() => handleShowQr(file)}
                    className="px-3 py-2 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold border border-gray-200 transition"
                    title="查看二维码"
                  >
                    二维码
                  </button>
                  <a 
                    href={`/share/${getShareToken(file)}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                    title="预览分享页"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                  <button 
                    onClick={() => handleUnshare(file.relative_path)}
                    className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition"
                    title="取消分享"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
               </div>
            </div>
          ))}
        </div>
      )}

      <ShareQrModal
        open={!!qrTarget}
        title={qrTarget?.title || ''}
        url={qrTarget?.url || ''}
        onClose={() => setQrTarget(null)}
      />
      </div>
    </div>
  );
}

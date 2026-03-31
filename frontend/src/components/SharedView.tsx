import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Link2, Trash2, ExternalLink, ShieldCheck, Download, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';

export function SharedView() {
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center animate-pulse text-gray-400">正在加载已分享内容...</div>;
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto">
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
            <div key={file.relative_path} className="bg-white/80 backdrop-blur-sm border border-white/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center gap-6 group">
               <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                  <Download className="w-6 h-6" />
               </div>
               <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 truncate">{file.title || file.relative_path.split('/').pop()}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 font-medium">
                     <span>{file.relative_path}</span>
                     {file.access_password && <span className="flex items-center gap-1 text-amber-500"><ShieldCheck className="w-3 h-3" /> 加密</span>}
                     <span>更新于 {file.updated_at ? format(new Date(file.updated_at), 'yyyy-MM-dd HH:mm') : '未知'}</span>
                  </div>
               </div>
               <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => handleCopy(file)}
                    className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition"
                    title="复制分享链接"
                   >
                    {copiedId === file.relative_path ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                  <a 
                    href={`/share/${getShareToken(file)}`} 
                    target="_blank" 
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
    </div>
  );
}

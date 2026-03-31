import { useMemo } from 'react';
import { Copy, ExternalLink, X } from 'lucide-react';

interface ShareQrModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
}

export function ShareQrModal({ open, title, url, onClose }: ShareQrModalProps) {
  const qrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
  }, [url]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-3xl border border-white/40 bg-white/95 shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-800">分享二维码</h3>
            <p className="text-sm text-gray-500 mt-1 truncate max-w-[260px]">{title}</p>
          </div>

          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col items-center text-center gap-4">
          <div className="rounded-3xl bg-white border border-gray-100 p-5 shadow-sm">
            <img src={qrImageUrl} alt={`分享二维码：${title}`} className="w-64 h-64 rounded-2xl" />
          </div>

          <p className="text-xs text-gray-500 break-all bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3">{url}</p>

          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => navigator.clipboard.writeText(url)}
              className="flex-1 px-4 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition inline-flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" /> 复制链接
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 px-4 py-3 rounded-2xl bg-white border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" /> 打开分享页
            </a>
          </div>

          <p className="text-[11px] text-gray-400">二维码由在线服务生成，用于便捷扫码访问当前分享链接。</p>
        </div>
      </div>
    </div>
  );
}
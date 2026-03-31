import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { ArrowLeft, Folder, Home, LoaderCircle, X } from 'lucide-react';

interface DirectoryEntry {
  name: string;
  relativePath: string;
}

interface DirectoryPickerModalProps {
  open: boolean;
  mode: 'move' | 'copy' | null;
  initialPath: string;
  sourcePaths: string[];
  onClose: () => void;
  onConfirm: (destinationDir: string) => Promise<void>;
}

function getBaseName(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean);
  return parts[parts.length - 1] || '根目录';
}

export function DirectoryPickerModal({ open, mode, initialPath, sourcePaths, onClose, onConfirm }: DirectoryPickerModalProps) {
  const [currentDir, setCurrentDir] = useState(initialPath);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const actionText = mode === 'copy' ? '复制到' : '移动到';

  useEffect(() => {
    if (!open) return;
    setCurrentDir(initialPath);
    setError('');
  }, [open, initialPath]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const fetchDirectories = async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await api.getFiles(currentDir);
        if (cancelled) return;

        const nextDirectories = (res.files || [])
          .filter((file: any) => file.isDirectory)
          .map((file: any) => ({
            name: file.name,
            relativePath: file.relativePath,
          }))
          .sort((a: DirectoryEntry, b: DirectoryEntry) => a.name.localeCompare(b.name, 'zh-CN'));

        setDirectories(nextDirectories);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '加载目录失败');
          setDirectories([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchDirectories();
    return () => {
      cancelled = true;
    };
  }, [open, currentDir]);

  const breadcrumbParts = currentDir.split('/').filter(Boolean);
  const sourceSummary = useMemo(() => sourcePaths.slice(0, 3).map(getBaseName), [sourcePaths]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await onConfirm(currentDir);
    } catch (err: any) {
      setError(err.message || `${actionText}失败`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || !mode) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />

      <div className="relative w-full max-w-3xl rounded-3xl border border-white/40 bg-white/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-xl font-bold text-gray-800">{actionText}目录</h3>
            <p className="text-sm text-gray-500 mt-1">
              已选择 {sourcePaths.length} 项：{sourceSummary.join('、')}{sourcePaths.length > sourceSummary.length ? '…' : ''}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/70 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCurrentDir('')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Home className="w-4 h-4" /> 根目录
            </button>

            <button
              onClick={() => {
                const parts = currentDir.split('/').filter(Boolean);
                parts.pop();
                setCurrentDir(parts.join('/'));
              }}
              disabled={!currentDir}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" /> 返回上一级
            </button>
          </div>

          <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3 text-sm text-gray-600">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">当前目标目录</p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setCurrentDir('')} className="font-semibold text-indigo-600 hover:underline">根目录</button>
              {breadcrumbParts.map((part, index) => (
                <button
                  key={`${part}-${index}`}
                  onClick={() => setCurrentDir(breadcrumbParts.slice(0, index + 1).join('/'))}
                  className="font-medium text-gray-500 hover:text-indigo-600"
                >
                  / {part}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-6 min-h-[320px] max-h-[50vh] overflow-y-auto bg-white">
          {isLoading ? (
            <div className="h-full min-h-[260px] flex items-center justify-center text-gray-400 gap-2">
              <LoaderCircle className="w-5 h-5 animate-spin" />
              正在加载目录...
            </div>
          ) : directories.length === 0 ? (
            <div className="h-full min-h-[260px] flex items-center justify-center rounded-3xl border-2 border-dashed border-gray-200 text-gray-400 font-medium bg-gray-50/40">
              当前目录下暂无可选子文件夹，你也可以直接确认选择当前目录。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
              {directories.map((directory) => (
                <button
                  key={directory.relativePath}
                  onClick={() => setCurrentDir(directory.relativePath)}
                  className="text-left p-4 rounded-2xl border border-gray-100 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-all flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                    <Folder className="w-5 h-5" fill="currentColor" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{directory.name}</p>
                    <p className="text-xs text-gray-400 truncate">/{directory.relativePath}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-5 border-t border-gray-100 bg-gray-50/80 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            你将把 <span className="font-semibold text-gray-700">{sourcePaths.length}</span> 项{actionText}
            <span className="font-semibold text-indigo-600"> /{currentDir || '' || ''}</span>
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {isSubmitting && <LoaderCircle className="w-4 h-4 animate-spin" />}
              确认{actionText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react';
import { File, Folder, MoreHorizontal, UploadCloud, FolderPlus, Trash2, Search, Download, Copy, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { api, triggerBlobDownload } from '../lib/api';
import { DirectoryPickerModal } from './DirectoryPickerModal';

export interface FileItem {
  id: string; // generated from relativePath
  name: string;
  isDirectory: boolean;
  relativePath: string;
  size: number;
  lastModified?: number;
  metaInfo?: {
    title: string | null;
    description: string | null;
    is_public: boolean;
    access_password?: string | null;
    share_id?: string | null;
    expires_at?: string | null;
    max_views?: number | null;
    max_downloads?: number | null;
    views?: number;
    downloads?: number;
  } | null;
}

interface FileListProps {
  files: FileItem[];
  currentPath: string;
  onFileClick: (file: FileItem) => void;
  onDetailClick?: (file: FileItem) => void;
  selectedFileId?: string;
  onUpdate?: () => void;
}

interface UploadTask {
  id: string;
  name: string;
  size: number;
  loaded: number;
  total: number;
  percent: number;
  speed: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / Math.pow(1024, index);

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '计算中';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function FileList({ files, currentPath, onFileClick, onDetailClick, selectedFileId, onUpdate }: FileListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortMode, setSortMode] = useState<'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'updated-desc' | 'updated-asc'>('name-asc');
  const [pickerMode, setPickerMode] = useState<'move' | 'copy' | null>(null);
  const [pickerPaths, setPickerPaths] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    setSelectedPaths(prev => prev.filter(path => files.some(file => file.relativePath === path)));
  }, [files, currentPath]);

  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths]);

  const visibleFiles = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const filtered = files.filter(file => {
      if (!keyword) return true;
      const label = (file.metaInfo?.title || file.name).toLowerCase();
      return label.includes(keyword) || file.name.toLowerCase().includes(keyword) || file.relativePath.toLowerCase().includes(keyword);
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }

      switch (sortMode) {
        case 'name-desc':
          return b.name.localeCompare(a.name, 'zh-CN');
        case 'size-desc':
          return (b.size || 0) - (a.size || 0) || a.name.localeCompare(b.name, 'zh-CN');
        case 'size-asc':
          return (a.size || 0) - (b.size || 0) || a.name.localeCompare(b.name, 'zh-CN');
        case 'updated-desc':
          return (b.lastModified || 0) - (a.lastModified || 0) || a.name.localeCompare(b.name, 'zh-CN');
        case 'updated-asc':
          return (a.lastModified || 0) - (b.lastModified || 0) || a.name.localeCompare(b.name, 'zh-CN');
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name, 'zh-CN');
      }
    });

    return sorted;
  }, [files, searchKeyword, sortMode]);

  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every(file => selectedPathSet.has(file.relativePath));

  const toggleSelection = (file: FileItem) => {
    setSelectedPaths(prev => prev.includes(file.relativePath)
      ? prev.filter(path => path !== file.relativePath)
      : [...prev, file.relativePath]);
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedPaths(prev => prev.filter(path => !visibleFiles.some(file => file.relativePath === path)));
      return;
    }

    setSelectedPaths(prev => Array.from(new Set([...prev, ...visibleFiles.map(file => file.relativePath)])));
  };

  const resetSelection = () => setSelectedPaths([]);

  const updateUploadTask = (id: string, patch: Partial<UploadTask>) => {
    setUploadTasks(prev => prev.map(task => task.id === id ? { ...task, ...patch } : task));
  };

  const uploadFiles = async (uploadTargets: File[]) => {
    if (uploadTargets.length === 0) return;

    const uploadDir = currentPath;
    const nextTasks: UploadTask[] = uploadTargets.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}-${Date.now()}`,
      name: file.name,
      size: file.size,
      loaded: 0,
      total: file.size,
      percent: 0,
      speed: 0,
      status: 'pending',
    }));

    setUploadTasks(nextTasks);
    setIsUploading(true);
    const failedFiles: string[] = [];

    try {
      for (let index = 0; index < uploadTargets.length; index += 1) {
        const uploadTarget = uploadTargets[index];
        const task = nextTasks[index];

        try {
          updateUploadTask(task.id, {
            status: 'uploading',
            speed: 0,
            loaded: 0,
            total: uploadTarget.size,
            percent: 0,
          });

          await api.uploadFile(uploadDir, uploadTarget, {
            onProgress: (progress) => {
              updateUploadTask(task.id, {
                status: 'uploading',
                loaded: progress.loaded,
                total: progress.total,
                percent: progress.percent,
                speed: progress.speed,
              });
            },
          });

          updateUploadTask(task.id, {
            status: 'success',
            loaded: uploadTarget.size,
            total: uploadTarget.size,
            percent: 100,
            speed: 0,
          });
        } catch (err: any) {
          console.error(err);
          failedFiles.push(uploadTarget.name);
          updateUploadTask(task.id, {
            status: 'error',
            speed: 0,
            error: err?.message || '上传失败',
          });
        }
      }

      onUpdate?.();

      if (failedFiles.length > 0) {
        alert(`以下文件上传失败：${failedFiles.join('、')}`);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const overallUploadTotal = uploadTasks.reduce((sum, task) => sum + Math.max(task.total || task.size, 0), 0);
  const overallUploaded = uploadTasks.reduce((sum, task) => sum + Math.max(task.loaded, 0), 0);
  const overallPercent = overallUploadTotal > 0 ? Math.min((overallUploaded / overallUploadTotal) * 100, 100) : 0;
  const uploadingCount = uploadTasks.filter(task => task.status === 'uploading').length;
  const successCount = uploadTasks.filter(task => task.status === 'success').length;
  const failedCount = uploadTasks.filter(task => task.status === 'error').length;
  const currentUploadSpeed = uploadTasks.reduce((sum, task) => sum + (task.status === 'uploading' ? task.speed : 0), 0);
  const activeUploadTask = uploadTasks.find(task => task.status === 'uploading');

  const getTaskStatusMeta = (task: UploadTask) => {
    switch (task.status) {
      case 'success':
        return {
          label: '已完成',
          icon: CheckCircle2,
          tone: 'text-emerald-600 bg-emerald-50 border-emerald-100',
          bar: 'from-emerald-500 to-teal-500',
        };
      case 'error':
        return {
          label: '失败',
          icon: AlertCircle,
          tone: 'text-rose-600 bg-rose-50 border-rose-100',
          bar: 'from-rose-500 to-orange-500',
        };
      case 'uploading':
        return {
          label: '上传中',
          icon: UploadCloud,
          tone: 'text-indigo-600 bg-indigo-50 border-indigo-100',
          bar: 'from-indigo-500 to-fuchsia-500',
        };
      default:
        return {
          label: '等待中',
          icon: UploadCloud,
          tone: 'text-gray-500 bg-gray-50 border-gray-100',
          bar: 'from-gray-400 to-gray-500',
        };
    }
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    try {
      await uploadFiles(fileList);
    } catch (err: any) {
      alert(err.message || '上传失败');
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer.types.includes('Files')) return;
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(dragCounterRef.current - 1, 0);
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);

    if (droppedFiles.length === 0) return;
    try {
      await uploadFiles(droppedFiles);
    } catch (err: any) {
      alert(err.message || '拖拽上传失败');
    }
  };

  const handleMkdir = async () => {
    const name = prompt('请输入文件夹名称:');
    if (!name) return;
    try {
      await api.mkdir(currentPath, name);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || '新建文件夹失败');
    }
  };

  const handleDelete = async (e: MouseEvent, file: FileItem) => {
    e.stopPropagation();
    if (!confirm(`确定要删除 ${file.name} 吗？${file.isDirectory ? '文件夹及其内部所有内容将被永久删除。' : ''}`)) return;
    try {
      await api.deleteFile(file.relativePath);
      setSelectedPaths(prev => prev.filter(path => path !== file.relativePath));
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPaths.length === 0) return;
    if (!confirm(`确定要批量删除选中的 ${selectedPaths.length} 项吗？此操作不可恢复。`)) return;
    try {
      await api.batchDelete(selectedPaths);
      resetSelection();
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || '批量删除失败');
    }
  };

  const handleBatchShareToggle = async (nextPublic: boolean) => {
    if (selectedPaths.length === 0) return;
    try {
      await api.batchShare(selectedPaths, nextPublic);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || (nextPublic ? '批量公开分享失败' : '批量取消分享失败'));
    }
  };

  const handleRename = async (file: FileItem) => {
    const newName = prompt('请输入新的名称：', file.name);
    if (newName == null || newName.trim() === '' || newName.trim() === file.name) return;

    try {
      await api.renameFile(file.relativePath, newName.trim());
      resetSelection();
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || '重命名失败');
    }
  };

  const handleMove = async (paths: string[]) => {
    if (paths.length === 0) return;
    setPickerMode('move');
    setPickerPaths(paths);
  };

  const handleCopyFiles = async (paths: string[]) => {
    if (paths.length === 0) return;
    setPickerMode('copy');
    setPickerPaths(paths);
  };

  const closePicker = () => {
    setPickerMode(null);
    setPickerPaths([]);
  };

  const handleDirectoryConfirm = async (destinationDir: string) => {
    if (pickerMode === 'move') {
      await api.moveFiles(pickerPaths, destinationDir);
    } else if (pickerMode === 'copy') {
      await api.copyFiles(pickerPaths, destinationDir);
    }

    closePicker();
    resetSelection();
    onUpdate?.();
  };

  const handleArchiveDownload = async (file: FileItem) => {
    try {
      const response = await api.downloadArchive(file.relativePath, file.name);
      triggerBlobDownload(response.blob, response.filename);
    } catch (err: any) {
      alert(err.message || '打包下载失败');
    }
  };

  const selectedSingleFile = selectedPaths.length === 1
    ? visibleFiles.find(file => file.relativePath === selectedPaths[0]) || files.find(file => file.relativePath === selectedPaths[0])
    : null;

  return (
    <div
      className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">文件存储</h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleMkdir}
            className="bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border border-gray-200 shadow-sm flex items-center gap-2 active:scale-95"
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            新建文件夹
          </button>
          
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} multiple />
          <button 
             onClick={() => fileInputRef.current?.click()}
             disabled={isUploading}
             className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md shadow-indigo-200/50 hover:shadow-lg active:scale-95 flex items-center gap-2"
          >
            {isUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {isUploading ? '正在上传...' : '上传文件'}
          </button>
        </div>
      </div>

      {uploadTasks.length > 0 && (
        <div className="mb-6 rounded-3xl border border-indigo-100 bg-white/85 backdrop-blur-sm p-5 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 mb-1">
                <UploadCloud className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-[0.25em]">上传队列</span>
              </div>
              <h3 className="text-lg font-bold text-gray-800">
                {isUploading ? `正在上传：${activeUploadTask?.name || '文件'}` : `上传完成：成功 ${successCount} 个${failedCount ? `，失败 ${failedCount} 个` : ''}`}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {isUploading
                  ? `当前速度 ${formatSpeed(currentUploadSpeed)} · 总进度 ${overallPercent.toFixed(1)}%`
                  : '你可以继续上传，或清空本次上传记录。'}
              </p>
            </div>

            {!isUploading && (
              <button
                onClick={() => setUploadTasks([])}
                className="self-start lg:self-center inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
              >
                <X className="w-4 h-4" /> 清空记录
              </button>
            )}
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-gray-600">总体进度</span>
              <span className="font-mono text-gray-500">{formatBytes(overallUploaded)} / {formatBytes(overallUploadTotal)}</span>
            </div>
            <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-sky-500 transition-all duration-300"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              <span>总数：{uploadTasks.length}</span>
              <span>上传中：{uploadingCount}</span>
              <span>成功：{successCount}</span>
              <span>失败：{failedCount}</span>
            </div>
          </div>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {uploadTasks.map(task => {
              const statusMeta = getTaskStatusMeta(task);
              const StatusIcon = statusMeta.icon;

              return (
                <div key={task.id} className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 truncate" title={task.name}>{task.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{formatBytes(task.size)}{task.status === 'uploading' ? ` · ${formatSpeed(task.speed)}` : ''}{task.error ? ` · ${task.error}` : ''}</div>
                    </div>

                    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusMeta.tone}`}>
                      <StatusIcon className={cn('w-3.5 h-3.5', task.status === 'uploading' && 'animate-pulse')} />
                      {statusMeta.label}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                    <span>{formatBytes(task.loaded)} / {formatBytes(task.total || task.size)}</span>
                    <span className="font-mono">{task.percent.toFixed(1)}%</span>
                  </div>

                  <div className="h-2.5 rounded-full bg-white overflow-hidden border border-gray-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${statusMeta.bar} transition-all duration-300`}
                      style={{ width: `${Math.max(0, Math.min(task.percent, 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-6 rounded-3xl border border-white/50 bg-white/70 backdrop-blur-sm p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索当前目录中的文件、标题或路径..."
                className="w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="name-asc">按名称升序</option>
              <option value="name-desc">按名称降序</option>
              <option value="updated-desc">按时间最新</option>
              <option value="updated-asc">按时间最旧</option>
              <option value="size-desc">按体积从大到小</option>
              <option value="size-asc">按体积从小到大</option>
            </select>
          </div>

          <div className="text-xs text-gray-500 font-medium">
            当前目录 {visibleFiles.length} 项{selectedPaths.length > 0 ? `，已选 ${selectedPaths.length} 项` : ''}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={toggleSelectAllVisible}
            className="px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition"
          >
            {allVisibleSelected ? '取消全选' : '全选当前结果'}
          </button>

          <button
            onClick={() => handleBatchShareToggle(true)}
            disabled={selectedPaths.length === 0}
            className="px-4 py-2 rounded-full bg-indigo-50 text-indigo-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量公开分享
          </button>

          <button
            onClick={() => handleBatchShareToggle(false)}
            disabled={selectedPaths.length === 0}
            className="px-4 py-2 rounded-full bg-amber-50 text-amber-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量取消分享
          </button>

          <button
            onClick={() => handleMove(selectedPaths)}
            disabled={selectedPaths.length === 0}
            className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量移动
          </button>

          <button
            onClick={() => handleCopyFiles(selectedPaths)}
            disabled={selectedPaths.length === 0}
            className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量复制
          </button>

          <button
            onClick={() => selectedSingleFile && handleArchiveDownload(selectedSingleFile)}
            disabled={!selectedSingleFile}
            className="px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            打包下载
          </button>

          <button
            onClick={() => selectedSingleFile && handleRename(selectedSingleFile)}
            disabled={!selectedSingleFile}
            className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            重命名
          </button>

          <button
            onClick={handleBatchDelete}
            disabled={selectedPaths.length === 0}
            className="px-4 py-2 rounded-full bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量删除
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {visibleFiles.map(file => {
          const isSelected = selectedFileId === file.relativePath || selectedPathSet.has(file.relativePath);
          return (
            <div 
              key={file.id}
              onClick={() => onFileClick(file)}
              className={cn(
                "group relative p-5 rounded-3xl border transition-all duration-300 cursor-pointer ease-out",
                isSelected 
                  ? "bg-indigo-50/50 border-indigo-200 shadow-lg shadow-indigo-100/50 ring-1 ring-indigo-200 ring-offset-2" 
                  : "bg-white/80 backdrop-blur-sm border-white/40 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:bg-white"
              )}
            >
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelection(file); }}
                className={cn(
                  "absolute top-4 left-4 z-20 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold transition",
                  selectedPathSet.has(file.relativePath)
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white/90 border-gray-200 text-gray-400 hover:border-indigo-300'
                )}
                title={selectedPathSet.has(file.relativePath) ? '取消选择' : '选择'}
              >
                {selectedPathSet.has(file.relativePath) ? '✓' : ''}
              </button>

              <div className="absolute top-3 right-3 flex flex-wrap justify-end max-w-[55%] items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-20">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleArchiveDownload(file); }}
                  className="p-1.5 hover:bg-emerald-50 rounded-full text-gray-400 hover:text-emerald-600 outline-none transition-colors"
                  title="打包下载"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleCopyFiles([file.relativePath]); }}
                  className="p-1.5 hover:bg-sky-50 rounded-full text-gray-400 hover:text-sky-600 outline-none transition-colors"
                  title="复制到..."
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleRename(file); }}
                  className="px-2 py-1 text-[10px] rounded-full bg-white/90 hover:bg-white text-gray-500 hover:text-indigo-600 outline-none transition-colors"
                  title="重命名"
                >
                  重命名
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleMove([file.relativePath]); }}
                  className="px-2 py-1 text-[10px] rounded-full bg-white/90 hover:bg-white text-gray-500 hover:text-indigo-600 outline-none transition-colors"
                  title="移动到..."
                >
                  移动
                </button>
                <button 
                  onClick={(e) => handleDelete(e, file)}
                  className="p-1.5 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-500 outline-none transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDetailClick?.(file); }}
                  className="p-1.5 hover:bg-black/5 rounded-full text-gray-400 hover:text-gray-600 outline-none transition-colors"
                  title="更多选项 (分享/属性)"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 shadow-sm",
                 file.isDirectory 
                  ? "bg-gradient-to-tr from-amber-100 to-amber-50 text-amber-500 group-hover:from-amber-400 group-hover:to-amber-300 group-hover:text-white" 
                  : "bg-gradient-to-tr from-blue-100 to-indigo-50 text-indigo-500 group-hover:from-indigo-500 group-hover:to-blue-400 group-hover:text-white"
              )}>
                {file.isDirectory ? <Folder className="w-5 h-5" fill={file.isDirectory ? "currentColor" : "none"} /> : <File className="w-5 h-5" />}
              </div>

              <h3 className="font-semibold text-gray-800 truncate pr-8 pl-4" title={file.name}>
                {file.metaInfo?.title || file.name}
              </h3>

              <div className="mt-2 flex flex-wrap gap-1.5 min-h-[24px] pl-4">
                {file.metaInfo?.is_public && (
                  <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold">已分享</span>
                )}
                {file.metaInfo?.access_password && (
                  <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold">密码</span>
                )}
                {file.metaInfo?.expires_at && (
                  <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-600 text-[10px] font-bold">限时</span>
                )}
                {file.metaInfo?.max_views != null && (
                  <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-600 text-[10px] font-bold">限访问</span>
                )}
                {file.metaInfo?.max_downloads != null && (
                  <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold">限下载</span>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-4 pl-4">
                <p className="text-xs font-medium text-gray-400">
                  {file.isDirectory ? '文件夹' : file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : '0 子节'}
                </p>
                {file.lastModified && (
                  <p className="text-xs text-gray-400">
                    {format(file.lastModified, 'yyyy年M月d日')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {visibleFiles.length === 0 && (
        <div className="mt-10 rounded-3xl border border-dashed border-gray-300 bg-white/50 py-16 text-center text-gray-400 font-medium">
          当前目录暂无匹配结果。
        </div>
      )}

      <DirectoryPickerModal
        open={pickerMode !== null}
        mode={pickerMode}
        initialPath={currentPath}
        sourcePaths={pickerPaths}
        onClose={closePicker}
        onConfirm={handleDirectoryConfirm}
      />

      {isDragActive && (
        <div className="absolute inset-4 rounded-[32px] border-2 border-dashed border-indigo-300 bg-indigo-50/80 backdrop-blur-sm flex flex-col items-center justify-center text-center text-indigo-600 z-30 pointer-events-none">
          <UploadCloud className="w-12 h-12 mb-4" />
          <p className="text-lg font-bold">松开即可上传到当前目录</p>
          <p className="text-sm font-medium text-indigo-500 mt-2">目标路径：/{currentPath || ''}</p>
        </div>
      )}
    </div>
  )
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { File, Folder, MoreHorizontal, UploadCloud, FolderPlus, Trash2, Search, Download, Copy } from 'lucide-react';
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

export function FileList({ files, currentPath, onFileClick, onDetailClick, selectedFileId, onUpdate }: FileListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortMode, setSortMode] = useState<'name-asc' | 'name-desc' | 'size-desc' | 'size-asc' | 'updated-desc' | 'updated-asc'>('name-asc');
  const [pickerMode, setPickerMode] = useState<'move' | 'copy' | null>(null);
  const [pickerPaths, setPickerPaths] = useState<string[]>([]);

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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await api.uploadFile(currentPath, file);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || '上传失败');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  const handleDelete = async (e: React.MouseEvent, file: FileItem) => {
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
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">文件存储</h2>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleMkdir}
            className="bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-full text-sm font-semibold transition-all border border-gray-200 shadow-sm flex items-center gap-2 active:scale-95"
          >
            <FolderPlus className="w-4 h-4 text-amber-500" />
            新建文件夹
          </button>
          
          <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} />
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

      <div className="mb-6 rounded-3xl border border-white/50 bg-white/70 backdrop-blur-sm p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex-1 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-[220px]">
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

              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
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
    </div>
  )
}

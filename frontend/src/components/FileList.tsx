import React, { useRef, useState } from 'react';
import { File, Folder, MoreHorizontal, UploadCloud, FolderPlus, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { api } from '../lib/api';

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
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

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
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {files.map(file => {
          const isSelected = selectedFileId === file.relativePath;
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
              <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
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

              <h3 className="font-semibold text-gray-800 truncate pr-8" title={file.name}>
                {file.metaInfo?.title || file.name}
              </h3>
              
              <div className="flex items-center justify-between mt-4">
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
    </div>
  )
}

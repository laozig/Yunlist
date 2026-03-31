import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Info, File as FileIcon, Check, Copy, Zap, FolderOpen, Download } from 'lucide-react';
import { type FileItem } from './FileList';
import { cn } from '../lib/utils';
import { api, triggerBlobDownload } from '../lib/api';
import { format } from 'date-fns';
import { ShareQrModal } from './ShareQrModal';

interface FileDetailPanelProps {
  file: FileItem | null;
  onClose: () => void;
  onFolderOpen?: (file: FileItem) => void;
}

export function FileDetailPanel({ file, onClose, onFolderOpen }: FileDetailPanelProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [shareId, setShareId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isArchiveDownloading, setIsArchiveDownloading] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const toDatetimeLocal = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  };

  const parseLimitValue = (value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${label}必须是大于等于 0 的整数`);
    }

    return parsed;
  };

  useEffect(() => {
    if (file) {
      setTitle(file.metaInfo?.title || '');
      setDescription(file.metaInfo?.description || '');
      setIsPublic(file.metaInfo?.is_public || false);
      setAccessPassword(file.metaInfo?.access_password || '');
      setShareId(file.metaInfo?.share_id || '');
      setExpiresAt(toDatetimeLocal(file.metaInfo?.expires_at));
      setMaxViews(file.metaInfo?.max_views == null ? '' : String(file.metaInfo.max_views));
      setMaxDownloads(file.metaInfo?.max_downloads == null ? '' : String(file.metaInfo.max_downloads));
    }
  }, [file]);

  if (!file) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsedMaxViews = parseLimitValue(maxViews, '访问次数上限');
      const parsedMaxDownloads = parseLimitValue(maxDownloads, '下载次数上限');

      await api.updateMeta({
        relativePath: file.relativePath,
        title,
        description,
        isPublic,
        accessPassword: accessPassword || null,
        shareId: shareId || null,
        expiresAt: expiresAt || null,
        maxViews: parsedMaxViews,
        maxDownloads: parsedMaxDownloads,
      });
      onClose();
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveDownload = async () => {
    setIsArchiveDownloading(true);
    try {
      const response = await api.downloadArchive(file.relativePath, file.name);
      triggerBlobDownload(response.blob, response.filename);
    } catch (err: any) {
      alert(err.message || '打包下载失败');
    } finally {
      setIsArchiveDownloading(false);
    }
  };

  const handleCopy = () => {
    if (!file) return;
    const id = shareId.trim() || btoa(encodeURIComponent(file.relativePath));
    const url = `${window.location.origin}/share/${id}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const generateRandomId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
       result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setShareId(result);
  };

  return (
    <AnimatePresence>
      {file && (
        <>
          {/* 背景模糊遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-gray-900/10 backdrop-blur-sm z-40"
          />

          {/* 右侧滑出面板 */}
          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.5 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:w-[420px] bg-white shadow-[0_0_40px_rgba(0,0,0,0.05)] z-50 flex flex-col border-l border-gray-100/50"
          >
            {/* Header */}
            <div className="px-4 sm:px-8 flex items-center justify-between h-16 sm:h-20 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Info className="w-5 h-5 text-indigo-500" />
                {file.isDirectory ? '文件夹详情' : '文件详情'}
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8">
              {/* File Icon & Info Box */}
              <div className="bg-indigo-50/50 rounded-2xl p-6 flex flex-col items-center justify-center border border-indigo-100/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-16 -mt-16" />
                <div className="w-16 h-16 rounded-3xl bg-white shadow-xl shadow-indigo-200/50 flex items-center justify-center mb-4 relative z-10 transition-transform active:scale-95 cursor-pointer">
                   {file.isDirectory 
                     ? <FolderOpen className="w-8 h-8 text-amber-500" fill="currentColor" /> 
                     : <FileIcon className="w-8 h-8 text-indigo-500" />
                   }
                </div>
                <p className="font-semibold text-gray-800 break-all text-center leading-tight relative z-10 mb-2">
                  {file.name}
                </p>
                <div className="flex items-center gap-3 text-xs text-indigo-400 font-medium relative z-10 mb-4">
                  <span>{file.isDirectory ? '文件夹' : `${(file.size / 1024 / 1024).toFixed(2)} MB`}</span>
                  <span className="w-1 h-1 rounded-full bg-indigo-200" />
                  <span>{file.lastModified ? format(file.lastModified, 'yyyy-MM-dd') : '近期'}</span>
                </div>

                {file.isDirectory && onFolderOpen && (
                   <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2">
                     <button 
                       onClick={() => onFolderOpen(file)}
                       className="h-10 rounded-xl bg-white text-indigo-600 text-xs font-bold border border-indigo-100 shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 relative z-10 hover:bg-indigo-50"
                     >
                       <FolderOpen className="w-3.5 h-3.5" />
                       打开此文件夹
                     </button>

                     <button 
                       onClick={handleArchiveDownload}
                       disabled={isArchiveDownloading}
                       className="h-10 rounded-xl bg-white text-emerald-600 text-xs font-bold border border-emerald-100 shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 relative z-10 hover:bg-emerald-50 disabled:opacity-50"
                     >
                       {isArchiveDownloading ? <div className="w-3.5 h-3.5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                       打包下载
                     </button>
                   </div>
                )}

                {!file.isDirectory && (
                  <button 
                    onClick={handleArchiveDownload}
                    disabled={isArchiveDownloading}
                    className="w-full h-10 rounded-xl bg-white text-emerald-600 text-xs font-bold border border-emerald-100 shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 relative z-10 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {isArchiveDownloading ? <div className="w-3.5 h-3.5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    导出压缩包
                  </button>
                )}
              </div>

              {/* Title Edit */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
                  自定义标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="输入更直观的文件名称..."
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent hover:border-gray-200 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-gray-800 font-medium"
                />
              </div>

              {/* Description Edit */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
                  简介描述 (支持 Markdown)
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="在此输入文件说明、备注或预览须知... (支持富文本语法)"
                  rows={8}
                  className="w-full px-4 py-4 bg-gray-50 border border-transparent hover:border-gray-200 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-gray-800 resize-none text-sm leading-relaxed"
                />
              </div>
            </div>

            {/* Footer / Share Control */}
            <div className="p-4 sm:p-8 bg-gray-50/80 border-t border-gray-100 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-semibold text-gray-700">公开分享链接</label>
                <button 
                   onClick={() => setIsPublic(!isPublic)}
                   className={cn(
                     "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                     isPublic ? "bg-indigo-600" : "bg-gray-200"
                   )}
                >
                  <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", isPublic ? "translate-x-6" : "translate-x-1")} />
                </button>
              </div>

              <AnimatePresence>
                {isPublic && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mb-6"
                  >
                      <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50 flex flex-col gap-2">
                         <div className="flex items-center justify-between">
                           <span className="text-xs font-semibold text-indigo-600 uppercase tracking-widest leading-none">分享网址</span>
                           <button
                              onClick={handleCopy}
                              className={cn(
                                "text-[10px] font-bold px-2 py-1 rounded-md transition-all active:scale-95 flex items-center gap-1",
                                isCopied ? "bg-green-500 text-white border-transparent" : "bg-white border border-indigo-100 text-indigo-500 hover:bg-indigo-50"
                              )}
                           >
                              {isCopied ? <><Check className="w-3 h-3" /> 已复制!</> : <><Copy className="w-3 h-3" /> 复制链接</>}
                           </button>
                        </div>
                        <input 
                          readOnly 
                          value={`${window.location.origin}/share/${shareId.trim() || btoa(encodeURIComponent(file.relativePath))}`}
                          className="w-full bg-transparent text-[13px] text-gray-500 font-mono focus:outline-none truncate" 
                        />

                        <button
                          onClick={() => setShowQrModal(true)}
                          className="self-start mt-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50 transition"
                        >
                          查看分享二维码
                        </button>
                     </div>

                     <div className="mt-4 space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between px-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                              自定义分享后缀
                            </label>
                            <button 
                              onClick={generateRandomId}
                              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-bold flex items-center gap-0.5 hover:underline"
                            >
                              <Zap className="w-3 h-3" /> 随机生成
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 font-mono text-sm leading-none">/share/</span>
                            <input
                              type="text"
                              value={shareId}
                              onChange={e => setShareId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                              placeholder="例如: my-share-link"
                              className="w-full pl-16 pr-4 py-2.5 bg-white border border-gray-200 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-sm font-mono text-gray-700"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
                            访问密码 (可选)
                          </label>
                          <input
                            type="text"
                            value={accessPassword}
                            onChange={e => setAccessPassword(e.target.value)}
                            placeholder="留空则不设密码"
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-sm font-medium"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
                            分享过期时间 (可选)
                          </label>
                          <input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={e => setExpiresAt(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white border border-gray-200 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-sm font-medium"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
                              最大访问次数
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={maxViews}
                              onChange={e => setMaxViews(e.target.value)}
                              placeholder="留空不限"
                              className="w-full px-4 py-2.5 bg-white border border-gray-200 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-sm font-medium"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase tracking-wider text-gray-400 ml-1">
                              最大下载次数
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={maxDownloads}
                              onChange={e => setMaxDownloads(e.target.value)}
                              placeholder="留空不限"
                              className="w-full px-4 py-2.5 bg-white border border-gray-200 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none text-sm font-medium"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-medium text-gray-500 bg-white rounded-2xl border border-gray-100 p-4">
                          <div>
                            <p className="text-gray-400 uppercase tracking-wider text-[10px] mb-1">累计访问</p>
                            <p className="text-base font-bold text-gray-700">{file.metaInfo?.views ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-gray-400 uppercase tracking-wider text-[10px] mb-1">累计下载</p>
                            <p className="text-base font-bold text-gray-700">{file.metaInfo?.downloads ?? 0}</p>
                          </div>
                        </div>
                     </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold shadow-xl shadow-indigo-200/50 bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 transition-all hover:-translate-y-0.5"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    保存修改
                  </>
                )}
              </button>
            </div>
          </motion.div>

          <ShareQrModal
            open={showQrModal}
            title={title || file.name}
            url={`${window.location.origin}/share/${shareId.trim() || btoa(encodeURIComponent(file.relativePath))}`}
            onClose={() => setShowQrModal(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api, type TrashItem } from '../lib/api';
import { RotateCcw, Trash2, Folder, FileText, Search } from 'lucide-react';
import { format } from 'date-fns';

function formatSize(bytes: number) {
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

export function TrashView() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchTrashItems = async () => {
    setLoading(true);
    try {
      const res = await api.getTrashItems();
      setItems(res.items);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTrashItems();
  }, []);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const filteredItems = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase();
    if (!lowerKeyword) return items;

    return items.filter((item) =>
      item.item_name.toLowerCase().includes(lowerKeyword) ||
      item.original_path.toLowerCase().includes(lowerKeyword)
    );
  }, [items, keyword]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIdSet.has(item.id));

  const toggleSelection = (item: TrashItem) => {
    setSelectedIds((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]);
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredItems.some((item) => item.id === id)));
      return;
    }

    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredItems.map((item) => item.id)])));
  };

  const handleRestore = async (item: TrashItem) => {
    if (!confirm(`确定要恢复 ${item.item_name} 吗？`)) return;
    try {
      await api.restoreTrashItem(item.id);
      await fetchTrashItems();
    } catch (err: any) {
      alert(err.message || '恢复失败');
    }
  };

  const handleBatchRestore = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要恢复选中的 ${selectedIds.length} 项吗？`)) return;

    try {
      const res = await api.restoreTrashItems(selectedIds);
      await fetchTrashItems();
      setSelectedIds([]);

      if (res.failed.length > 0) {
        alert(`部分恢复失败：${res.failed.map(item => item.error).join('；')}`);
      }
    } catch (err: any) {
      alert(err.message || '批量恢复失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要彻底删除选中的 ${selectedIds.length} 项吗？该操作不可恢复。`)) return;

    try {
      const res = await api.deleteTrashItems(selectedIds);
      await fetchTrashItems();
      setSelectedIds([]);

      if (res.failed.length > 0) {
        alert(`部分删除失败：${res.failed.map(item => item.error).join('；')}`);
      }
    } catch (err: any) {
      alert(err.message || '批量删除失败');
    }
  };

  const handleDelete = async (item: TrashItem) => {
    if (!confirm(`确定要彻底删除 ${item.item_name} 吗？该操作不可恢复。`)) return;
    try {
      await api.deleteTrashItem(item.id);
      await fetchTrashItems();
    } catch (err: any) {
      alert(err.message || '彻底删除失败');
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">正在加载回收站...</div>;
  }

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50/30">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">回收站</h2>
            <p className="text-sm text-gray-500 mt-1">已删除的文件会先进入回收站，你可以选择恢复或彻底删除。</p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索回收站中的文件..."
              className="w-full rounded-2xl border border-gray-200 bg-white pl-11 pr-4 py-3 text-sm outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={toggleSelectAllVisible}
            className="px-4 py-2 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {allVisibleSelected ? '取消全选' : '全选当前结果'}
          </button>

          <button
            onClick={handleBatchRestore}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量恢复
          </button>

          <button
            onClick={handleBatchDelete}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 rounded-full bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            批量彻底删除
          </button>

          <span className="text-xs text-gray-500 font-medium">当前 {filteredItems.length} 项，已选 {selectedIds.length} 项</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white/60 py-20 text-center text-gray-400 font-medium">
            回收站当前为空。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="bg-white/85 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
                <button
                  onClick={() => toggleSelection(item)}
                  className={`w-6 h-6 rounded-full border shrink-0 flex items-center justify-center text-xs font-bold ${selectedIdSet.has(item.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-400'}`}
                >
                  {selectedIdSet.has(item.id) ? '✓' : ''}
                </button>

                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                  {item.is_directory ? <Folder className="w-5 h-5" fill="currentColor" /> : <FileText className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-gray-800 truncate">{item.item_name}</h3>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500 font-medium">
                    <span>原路径：/{item.original_path}</span>
                    <span>{item.is_directory ? '文件夹' : formatSize(item.size)}</span>
                    <span>删除于 {item.deleted_at ? format(new Date(item.deleted_at), 'yyyy-MM-dd HH:mm') : '未知'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                  <button
                    onClick={() => handleRestore(item)}
                    className="px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    恢复
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="px-4 py-2 rounded-full bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 transition inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    彻底删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
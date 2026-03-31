import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { ShieldCheck, Eye, EyeOff, Save } from 'lucide-react';
import { cn } from '../lib/utils';

export function SecurityView() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setMessage({ type: 'error', text: '新密码与确认密码不一致' });
    }
    
    setIsSaving(true);
    setMessage({ type: '', text: '' });
    
    try {
      await api.updateAdminPassword(oldPassword, newPassword);
      setMessage({ type: 'success', text: '密码修改成功，将在下次登录生效。' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '原密码校验失败' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 p-8 max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-800 tracking-tight">安全管理</h2>
        <p className="text-sm text-gray-500 mt-1">保护您的网盘控制台免受未经授权的访问。</p>
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-white/50 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-8 p-4 bg-amber-50 text-amber-700 rounded-2xl border border-amber-100/50">
          <ShieldCheck className="w-6 h-6 shrink-0" />
          <p className="text-sm font-medium leading-relaxed">
            建议定期更换管理员密码。新密码目前仅在后端 SQLite 中持久化，重启项目后仍然有效。
          </p>
        </div>

        <form onSubmit={handleUpdate} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">当前旧密码</label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all rounded-xl outline-none"
              />
              <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                {showOld ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">新密码</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all rounded-xl outline-none"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all rounded-xl outline-none"
            />
          </div>

          {message.text && (
            <div className={cn(
               "p-4 rounded-xl text-sm font-medium text-center transition-all",
               message.type === 'success' ? "bg-green-50 text-green-600 border border-green-100" : "bg-red-50 text-red-600 border border-red-100"
            )}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            {isSaving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-5 h-5" /> 保存修改</>}
          </button>
        </form>
      </div>
    </div>
  );
}

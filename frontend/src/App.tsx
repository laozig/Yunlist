import { useState, useEffect, type FormEvent } from 'react';
import { Sidebar } from './components/Sidebar';
import { FileList, type FileItem } from './components/FileList';
import { FileDetailPanel } from './components/FileDetailPanel';
import { SharedView } from './components/SharedView';
import { SecurityView } from './components/SecurityView';
import { SettingsView } from './components/SettingsView';
import { AnalyticsView } from './components/AnalyticsView';
import { TrashView } from './components/TrashView';
import { AuditView } from './components/AuditView';
import { api } from './lib/api';
import { Lock, LogOut, User, ChevronDown } from 'lucide-react';
import { cn } from './lib/utils';

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('yunlist_token'));
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [activeView, setActiveView] = useState('explorer');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const fetchFiles = async (dir = currentPath) => {
    if (activeView !== 'explorer') return;
    setIsLoading(true);
    try {
      const res = await api.getFiles(dir);
      const normalizedFiles = res.files.map((f: any) => ({ ...f, id: f.relativePath })) as FileItem[];
      setFiles(normalizedFiles);

      if (selectedFile && !normalizedFiles.some(file => file.relativePath === selectedFile.relativePath)) {
        setSelectedFile(null);
      }
    } catch (err: any) {
      console.error(err);
      if (err.status !== 401) {
         setLoginError(err.message || '获取文件列表失败');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeView === 'explorer') {
      fetchFiles(currentPath);
    }
  }, [token, currentPath, activeView]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const { token } = await api.login(password);
      localStorage.setItem('yunlist_token', token);
      setToken(token);
    } catch (err: any) {
      setLoginError('密码错误，请重试');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('yunlist_token');
    setToken(null);
    setShowProfileMenu(false);
  };

  const handleFileClick = (file: FileItem) => {
    if (file.isDirectory) {
      setCurrentPath(file.relativePath);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const goBack = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-96 flex flex-col items-center">
           <div className="w-16 h-16 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mb-6">
             <Lock className="w-8 h-8" />
           </div>
           <h2 className="text-xl font-bold text-gray-800 mb-8">管理员登录</h2>
           {loginError && <p className="text-red-500 text-sm mb-4 bg-red-50 p-3 rounded-lg w-full text-center">{loginError}</p>}
           <input
             type="password"
             value={password}
             onChange={e => setPassword(e.target.value)}
             placeholder="输入管理员密码"
             className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all duration-200 rounded-xl outline-none mb-6 text-center tracking-widest"
           />
           <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold shadow-md shadow-indigo-200 transition-all">
             登录控制台
           </button>
        </form>
      </div>
    );
  }

  const renderMainContent = () => {
    switch (activeView) {
      case 'shared':
        return <SharedView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'audit':
        return <AuditView />;
      case 'trash':
        return <TrashView />;
      case 'security':
        return <SecurityView />;
      case 'settings':
        return <SettingsView />;
      case 'explorer':
      default:
        return (
          <FileList 
            files={files} 
            currentPath={currentPath}
            onFileClick={handleFileClick} 
            onDetailClick={(file) => setSelectedFile(file)}
            selectedFileId={selectedFile?.relativePath}
            onUpdate={() => fetchFiles()}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center overflow-hidden font-sans selection:bg-indigo-100 selection:text-indigo-900 text-gray-800">
      <Sidebar activeItem={activeView} onSelect={(view) => { setActiveView(view); setSelectedFile(null); }} />

      <main className="flex-1 relative flex flex-col h-full overflow-hidden bg-white/60 backdrop-blur-2xl">
        <header className="h-20 flex items-center px-8 border-b border-white/40 sticky top-0 z-10 shrink-0">
          <div className="flex-1 flex gap-2 items-center">
             {activeView === 'explorer' && currentPath && (
               <button onClick={goBack} className="px-3 py-1.5 rounded-full hover:bg-white/50 bg-white/30 backdrop-blur shadow-sm text-sm font-semibold transition">
                 ← 返回
               </button>
             )}
             <div className="inline-flex px-3 py-1.5 rounded-full bg-white/50 border border-white backdrop-blur shadow-sm text-xs font-semibold text-gray-500">
                {activeView === 'explorer' ? '我的文件' : 
                 activeView === 'shared' ? '已分享' : 
                 activeView === 'analytics' ? '数据分析' :
                 activeView === 'audit' ? '访问审计' :
                 activeView === 'trash' ? '回收站' :
                 activeView === 'security' ? '安全管理' : 
                 activeView === 'settings' ? '系统设置' : activeView} 
                {activeView === 'explorer' && ` • / 根目录 ${currentPath}`}
             </div>
          </div>
          
          {/* Avatar Dropdown Area */}
          <div className="relative">
             <button 
               onClick={() => setShowProfileMenu(!showProfileMenu)}
               className="flex items-center gap-3 p-1.5 pr-3 rounded-full hover:bg-white/50 transition-all border border-transparent hover:border-white/40 group"
             >
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 border border-white/20 shadow-sm flex items-center justify-center font-bold text-white text-sm">
                   A
                </div>
                <div className="hidden sm:block text-left">
                   <p className="text-xs font-bold text-gray-800 leading-none">管理员</p>
                   <p className="text-[10px] text-gray-500 font-medium">Yunlist Owner</p>
                </div>
                <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", showProfileMenu && "rotate-180")} />
             </button>

             {showProfileMenu && (
               <>
                 <div className="fixed inset-0 z-20" onClick={() => setShowProfileMenu(false)} />
                 <div className="absolute right-0 mt-3 w-56 bg-white/90 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-2xl shadow-gray-900/5 py-2 px-2 z-30 animate-in fade-in zoom-in-95 duration-200">
                    <button onClick={() => { setActiveView('security'); setShowProfileMenu(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 transition text-sm font-medium">
                       <User className="w-4 h-4" />
                       个人账号安全
                    </button>
                    <div className="h-px bg-gray-100 my-1 mx-2" />
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 text-gray-600 hover:text-red-600 transition text-sm font-medium">
                       <LogOut className="w-4 h-4" />
                       退出登录
                    </button>
                 </div>
               </>
             )}
          </div>
        </header>

        {isLoading && <div className="absolute top-20 left-0 w-full h-1 bg-indigo-500/20 overflow-hidden"><div className="w-1/3 h-full bg-indigo-500 animate-[slide_1s_ease-in-out_infinite]" /></div>}
        
        {renderMainContent()}
      </main>

      <FileDetailPanel 
         file={selectedFile} 
         onClose={() => { setSelectedFile(null); fetchFiles(); }} 
         onFolderOpen={(file) => {
           setCurrentPath(file.relativePath);
           setSelectedFile(null);
         }}
      />
    </div>
  );
}

export default App;

import { HardDrive, Settings, FolderClosed, Users, ShieldAlert, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeItem: string;
  onSelect: (name: string) => void;
}

export function Sidebar({ activeItem, onSelect }: SidebarProps) {
  const menuItems = [
    { id: 'explorer', name: '我的文件', icon: HardDrive },
    { id: 'shared', name: '已分享', icon: Users },
    { id: 'analytics', name: '数据分析', icon: BarChart3 },
    { id: 'security', name: '安全管理', icon: ShieldAlert },
    { id: 'settings', name: '系统设置', icon: Settings },
  ];

  return (
    <aside className="w-64 h-full bg-white/60 backdrop-blur-md border-r border-gray-200/50 flex flex-col items-center py-8">
      <div className="flex items-center gap-3 mb-10 w-full px-8">
        <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-xl shadow-lg flex items-center justify-center">
          <FolderClosed className="text-white w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 tracking-tight">Yunlist</h1>
      </div>

      <nav className="flex-1 w-full px-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 font-medium text-sm",
                isActive 
                  ? "bg-white shadow-sm text-indigo-600 ring-1 ring-gray-100" 
                  : "text-gray-500 hover:bg-gray-100/50 hover:text-gray-900"
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              {item.name}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto px-6 w-full">
        <div className="w-full bg-gradient-to-br from-indigo-50 to-blue-50 border border-blue-100/50 rounded-2xl p-4 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
            <span className="font-bold text-indigo-600 text-sm">Ad</span>
          </div>
          <p className="text-sm font-semibold text-gray-800">超级管理员</p>
          <p className="text-xs text-gray-500 mt-1">存储使用率 42%</p>
        </div>
      </div>
    </aside>
  );
}

import { Clock, LayoutDashboard, LogOut, Settings, Users } from 'lucide-react';
import { auth } from '../lib/firebase';
import { User } from '../lib/types';
import { useNavigate } from 'react-router-dom';

export default function Sidebar({ user }: { user: User }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  return (
    <aside className="w-20 bg-[#0F172A] border-r border-slate-800 flex flex-col items-center py-8 gap-10 shadow-2xl z-20">
      <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(14,165,233,0.4)]">
        <Clock className="w-8 h-8 text-white" />
      </div>
      
      <nav className="flex flex-col gap-8 opacity-60">
        <button onClick={() => navigate(user.role === 'admin' ? '/admin' : user.role === 'manager' ? '/manager' : '/dashboard')} className="p-2 bg-slate-800 rounded-lg text-sky-400 opacity-100 hover:text-white transition-colors" title="Dashboard">
          <LayoutDashboard className="w-6 h-6" />
        </button>
        {user.role === 'admin' ? (
          <button onClick={() => navigate('/team')} className="p-2 text-slate-400 hover:text-white transition-colors" title="Team">
            <Users className="w-6 h-6" />
          </button>
        ) : (
          <button onClick={() => navigate('/portal')} className="p-2 text-slate-400 hover:text-white transition-colors" title="My Portal">
            <Users className="w-6 h-6" />
          </button>
        )}
        <button onClick={() => navigate('/settings')} className="p-2 text-slate-400 hover:text-white transition-colors" title="Settings">
          <Settings className="w-6 h-6" />
        </button>
      </nav>
      
      <div className="mt-auto pb-6 flex flex-col gap-6 items-center">
        <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-400 transition-colors" title="Logout">
          <LogOut className="w-6 h-6" />
        </button>
        <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center text-xs font-bold text-white uppercase" title={user.name}>
          {user.name.substring(0, 2)}
        </div>
      </div>
    </aside>
  );
}

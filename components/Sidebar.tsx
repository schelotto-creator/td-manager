'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  Home, 
  Users, 
  Dumbbell, 
  ShoppingCart, 
  Calendar, 
  UserCheck, 
  Trophy,
  BarChart2,
  User,
  ShieldAlert,
  LogOut,
  Globe,
  DollarSign 
} from 'lucide-react';

const MENU_ITEMS = [
  { name: 'Inicio', path: '/', icon: Home },
  { name: 'Mi Perfil', path: '/manager', icon: User },
  { name: 'Ligas Mundiales', path: '/leagues', icon: Globe },
  { name: 'Calendario', path: '/calendar', icon: Calendar },
  { name: 'Estadísticas', path: '/stats', icon: BarChart2 },
  { name: 'Plantilla', path: '/roster', icon: UserCheck },
  { name: 'Pizarra', path: '/tactics', icon: Users },
  { name: 'Gimnasio', path: '/training', icon: Dumbbell },
  { name: 'Finanzas', path: '/finance', icon: DollarSign },
  { name: 'Mercado', path: '/market', icon: ShoppingCart },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('managers').select('is_admin').eq('owner_id', user.id).single();
        if (data && data.is_admin) {
          setIsAdmin(true);
        }
      }
    };
    
    checkAdminStatus();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <aside className="w-64 bg-surface border-r border-white/10 hidden md:flex flex-col h-screen sticky top-0">
      
      {/* LOGO */}
      <div className="p-6 border-b border-white/10">
        <Link href="/" className="hover:opacity-80 transition-opacity">
            <h1 className="text-2xl font-display font-bold text-primary tracking-tighter flex items-center gap-2">
            <Trophy className="text-yellow-400" />
            TD MANAGER
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-bold uppercase tracking-widest">Temporada 2026</p>
        </Link>
      </div>

      {/* MENÚ DE NAVEGACIÓN REORDENADO */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {MENU_ITEMS.map((item) => {
          const isActive = pathname === item.path;
          const Icon = item.icon;

          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
                isActive 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-white' : 'text-slate-500'} />
              {item.name}
            </Link>
          );
        })}

        {/* --- ENLACE SECRETO DE COMISIONADO (Solo Admins) --- */}
        {isAdmin && (
          <div className="pt-4 mt-4 border-t border-white/5">
            <Link 
              href="/admin"
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${
                pathname === '/admin' 
                  ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/20' 
                  : 'bg-red-500/5 text-red-400 border-red-500/20 hover:bg-red-500/10 hover:border-red-500/50'
              }`}
            >
              <ShieldAlert size={20} className={pathname === '/admin' ? 'text-white' : 'text-red-400'} />
              Comisionado
            </Link>
          </div>
        )}
      </nav>

      {/* FOOTER CON ESTADO Y LOGOUT */}
      <div className="p-4 border-t border-white/10 flex flex-col gap-3">
        <div className="bg-black/20 rounded-xl p-3 border border-white/5">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Estado del Servidor</div>
            <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-xs text-white font-mono">ESTABLE</span>
            </div>
        </div>

        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/5 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest border border-red-500/20"
        >
          <LogOut size={16} /> Cerrar Sesión
        </button>
      </div>
      
    </aside>
  );
}
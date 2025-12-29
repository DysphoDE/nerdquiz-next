'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  FolderOpen, 
  HelpCircle, 
  Upload,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  BarChart3,
  LogOut,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const navItems: NavItem[] = [
  { 
    href: '/admin', 
    label: 'Dashboard', 
    icon: <LayoutDashboard className="w-5 h-5" /> 
  },
  { 
    href: '/admin/categories', 
    label: 'Kategorien', 
    icon: <FolderOpen className="w-5 h-5" /> 
  },
  { 
    href: '/admin/questions', 
    label: 'Fragen', 
    icon: <HelpCircle className="w-5 h-5" /> 
  },
  { 
    href: '/admin/import', 
    label: 'Import', 
    icon: <Upload className="w-5 h-5" />,
    badge: 'Beta',
  },
  { 
    href: '/admin/stats', 
    label: 'Statistiken', 
    icon: <BarChart3 className="w-5 h-5" /> 
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="fixed left-0 top-0 h-screen bg-card border-r border-border flex flex-col z-50"
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-lg gradient-text">NerdQuiz</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== '/admin' && pathname.startsWith(item.href));
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                      'hover:bg-muted group relative',
                      isActive && 'bg-primary/10 text-primary'
                    )}
                  >
                    <span className={cn(
                      'transition-colors',
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    )}>
                      {item.icon}
                    </span>
                    
                    <AnimatePresence mode="wait">
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className={cn(
                            'font-medium whitespace-nowrap',
                            isActive ? 'text-primary' : 'text-foreground'
                          )}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    
                    {item.badge && !collapsed && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="ml-auto text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary"
                      >
                        {item.badge}
                      </motion.span>
                    )}
                    
                    {isActive && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border space-y-1">
          <Link
            href="/"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
              'hover:bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            <Gamepad2 className="w-5 h-5" />
            {!collapsed && <span>Zum Spiel</span>}
          </Link>
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full',
              'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'
            )}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span>Abmelden</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main 
        className={cn(
          'flex-1 min-h-screen transition-all duration-200',
          collapsed ? 'ml-[72px]' : 'ml-64'
        )}
      >
        {children}
      </main>
    </div>
  );
}




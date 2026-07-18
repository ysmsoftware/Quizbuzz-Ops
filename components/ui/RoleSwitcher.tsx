'use client';

import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { AdminRole } from '@/lib/types';
import { Shield, ShieldAlert, ShieldCheck, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const ROLES: { value: AdminRole; label: string; icon: any; color: string }[] = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', icon: ShieldAlert, color: 'text-destructive bg-destructive/10' },
  { value: 'SUPPORT', label: 'Support Agent', icon: Shield, color: 'text-primary bg-primary/10' },
  { value: 'BILLING_ADMIN', label: 'Billing Admin', icon: ShieldCheck, color: 'text-warning bg-warning/10' },
];

export default function RoleSwitcher() {
  const { admin, switchRole } = useCurrentAdmin();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!admin) return null;

  const currentRoleInfo = ROLES.find((r) => r.value === admin.role) || ROLES[0];
  const Icon = currentRoleInfo.icon;

  const handleRoleSwitch = (role: AdminRole) => {
    switchRole(role);
    setIsOpen(false);
    toast(
      'Role Switched',
      `You are now acting as a ${role.replace('_', ' ')}. Permissions updated.`,
      'info'
    );
  };

  return (
    <div id="role-switcher-container" className="relative" ref={containerRef}>
      <button
        id="role-switcher-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-border/50 bg-card hover:bg-secondary/50 transition-colors"
      >
        <div className={`p-1 rounded-sm ${currentRoleInfo.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="hidden sm:inline font-sans">{currentRoleInfo.label}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground ml-1" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-52 bg-card text-card-foreground border border-border/50 rounded-lg shadow-xl p-1 z-50 pointer-events-auto"
          >
            <div className="px-2.5 py-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground font-sans">
              Switch Admin Persona
            </div>
            {ROLES.map((role) => {
              const RoleIcon = role.icon;
              const isSelected = role.value === admin.role;

              return (
                <button
                  key={role.value}
                  onClick={() => handleRoleSwitch(role.value)}
                  className={`w-full text-left flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors font-sans ${
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RoleIcon className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span>{role.label}</span>
                  </div>
                  {isSelected && (
                    <span className="h-1.5 w-1.5 bg-primary rounded-full shrink-0" />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

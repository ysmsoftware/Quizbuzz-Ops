'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (title: string, description?: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((title: string, description?: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, description, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto bg-card text-card-foreground border border-border/50 p-4 rounded-xl shadow-lg flex gap-3 items-start justify-between"
            >
              <div className="flex gap-2 items-start">
                {item.type === 'success' && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                {item.type === 'warning' && <AlertCircle className="h-5 w-5 text-warning shrink-0" />}
                {item.type === 'error' && <XCircle className="h-5 w-5 text-destructive shrink-0" />}
                {item.type === 'info' && <Info className="h-5 w-5 text-primary shrink-0" />}
                
                <div>
                  <h4 className="font-semibold text-sm leading-tight">{item.title}</h4>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1 leading-normal">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
              
              <button
                onClick={() => removeToast(item.id)}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded-md hover:bg-secondary/50 transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Shield, Sparkles, KeyRound, Mail, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { AdminRole } from '@/lib/types';

const loginSchema = z.object({
  email: z.string().email({ message: 'Enter a valid corporate email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
  role: z.enum(['SUPER_ADMIN', 'SUPPORT', 'BILLING_ADMIN'] as const),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginView() {
  const { admin, login, isLoggingIn } = useCurrentAdmin();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (admin) {
      router.push('/dashboard');
    }
  }, [admin, router]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@quizbuzz.internal',
      password: 'demo1234',
      role: 'SUPER_ADMIN',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await login({
        email: values.email,
        password: values.password,
        role: values.role,
      });
      toast(
        'Welcome Back!',
        `Logged in successfully as ${values.role.replace('_', ' ')}.`,
        'success'
      );
      router.push('/dashboard');
    } catch (e: any) {
      toast('Login Failed', e.message || 'Incorrect password.', 'error');
    }
  };

  const handleRoleSelect = (role: AdminRole, defaultEmail: string) => {
    setValue('role', role);
    setValue('email', defaultEmail);
  };

  return (
    <div id="login-viewport" className="min-h-screen w-full flex items-center justify-center bg-background/50 p-4 font-sans selection:bg-primary/20">
      {/* Visual background ambient blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl -z-10 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, type: 'spring', stiffness: 200, damping: 25 }}
        className="w-full max-w-lg bg-card text-card-foreground border border-border/50 rounded-xl shadow-xl overflow-hidden py-10 px-8 relative"
      >
        {/* Branding header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="p-3 bg-primary/10 rounded-xl mb-4 text-primary relative">
            <Sparkles className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
          </div>
          
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-sans">
            QuizBuzz <span className="text-primary font-light">— Ops</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 uppercase font-bold tracking-wider font-sans">
            SaaS Internal Platform Controller
          </p>
        </div>

        {/* Demo Warning Information */}
        <div className="bg-secondary/40 border border-border/50 rounded-lg p-3.5 mb-6 flex gap-3 text-xs text-muted-foreground font-sans">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-foreground">Sandbox Credentials:</span> Use password{' '}
            <code className="font-mono bg-card px-1.5 py-0.5 rounded text-primary font-bold">demo1234</code>. 
            Select an operator profile below to instantly populate credentials and roles.
          </div>
        </div>

        {/* Role Quick Pickers */}
        <div className="mb-6">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2 font-sans">
            Quick Pick Administrator Persona
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { role: 'SUPER_ADMIN', label: 'Super Admin', email: 'admin@quizbuzz.internal', desc: 'Full permissions' },
              { role: 'SUPPORT', label: 'Support Ops', email: 'support@quizbuzz.internal', desc: 'Audits & Impersonate' },
              { role: 'BILLING_ADMIN', label: 'Billing Manager', email: 'billing@quizbuzz.internal', desc: 'Plans & Refunds' },
            ].map((item) => {
              const active = selectedRole === item.role;
              return (
                <button
                  id={`role-btn-${item.role.toLowerCase()}`}
                  key={item.role}
                  type="button"
                  onClick={() => handleRoleSelect(item.role as AdminRole, item.email)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                    active
                      ? 'border-primary/50 bg-primary/10 text-primary shadow-sm'
                      : 'border-border/50 bg-secondary/20 text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                  }`}
                >
                  <p className="text-xs font-bold font-sans truncate leading-none mb-1">{item.label}</p>
                  <span className="text-[9px] block text-muted-foreground/80 leading-none">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 font-sans">
          {/* Email input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground block">
              Operator Corporate Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                <Mail className="h-4 w-4" />
              </span>
              <input
                {...register('email')}
                type="text"
                className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/20 border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground placeholder:text-muted-foreground/50"
                placeholder="name@quizbuzz.internal"
              />
            </div>
            {errors.email && (
              <p className="text-[11px] text-destructive font-medium mt-1 leading-none">{errors.email.message}</p>
            )}
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground block">
              Authorization Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                <KeyRound className="h-4 w-4" />
              </span>
              <input
                {...register('password')}
                type="password"
                className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/20 border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground placeholder:text-muted-foreground/50"
                placeholder="••••••••"
              />
            </div>
            {errors.password && (
              <p className="text-[11px] text-destructive font-medium mt-1 leading-none">{errors.password.message}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={isLoggingIn}
            className="w-full mt-6 bg-primary text-primary-foreground font-semibold text-sm h-10 rounded-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Shield className="h-4 w-4" />
            <span>{isLoggingIn ? 'Authenticating Operator...' : 'Authorize Secure Access'}</span>
          </button>
        </form>

        {/* Footer Credit */}
        <p className="text-center text-[10px] text-muted-foreground/60 mt-8 leading-none">
          SECURE CHANNEL • QUIZBUZZ PLATFORM INTERNAL ONLY
        </p>
      </motion.div>
    </div>
  );
}

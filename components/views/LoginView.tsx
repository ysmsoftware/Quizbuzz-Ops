'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useCurrentAdmin } from '@/lib/hooks/useAuth';
import { useToast } from '@/components/ui/Toast';
import { Shield, Sparkles, KeyRound, Mail } from 'lucide-react';
import { motion } from 'motion/react';

const loginSchema = z.object({
  email: z.string().email({ message: 'Enter a valid corporate email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginView() {
  const { admin, login, isLoggingIn, verifyOtp, isVerifyingOtp } = useCurrentAdmin();
  const { toast } = useToast();
  const router = useRouter();

  // OTP login flow state
  const [showOtp, setShowOtp] = useState(false);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  useEffect(() => {
    if (admin) {
      router.push('/dashboard');
    }
  }, [admin, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const result = await login({
        email: values.email,
        password: values.password,
      });

      if (result && result.otpRequired) {
        setOtpEmail(result.email);
        setShowOtp(true);
        setOtpCode(''); // reset code input
        toast(
          'Verification Required',
          `A 6-digit verification code has been sent to ${result.email}.`,
          'success'
        );
      }
    } catch (e: any) {
      toast('Login Failed', e.message || 'Incorrect password.', 'error');
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      toast('Invalid Code', 'OTP must be exactly 6 digits.', 'error');
      return;
    }

    try {
      await verifyOtp({
        email: otpEmail,
        otp: otpCode,
      });
      toast(
        'Welcome Back!',
        'Logged in successfully.',
        'success'
      );
      router.push('/dashboard');
    } catch (e: any) {
      toast('Verification Failed', e.message || 'Incorrect OTP code.', 'error');
    }
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

        {/* Conditional rendering for Form (Login Credentials vs. OTP code) */}
        {!showOtp ? (
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
                  placeholder="you@ysmquizbuzz.com"
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
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-4 font-sans">
            {/* OTP input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground block">
                Verification OTP sent to {otpEmail}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/20 border border-border/50 rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-foreground placeholder:text-muted-foreground/50 tracking-[0.3em] font-mono"
                  placeholder="000000"
                  required
                />
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Check your inbox for the 6-digit verification code. It expires shortly, so request a new one if it doesn't arrive in a few minutes.
              </p>
            </div>

            {/* Submit Button */}
            <button
              id="otp-submit-btn"
              type="submit"
              disabled={isVerifyingOtp}
              className="w-full mt-6 bg-primary text-primary-foreground font-semibold text-sm h-10 rounded-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Shield className="h-4 w-4" />
              <span>{isVerifyingOtp ? 'Verifying OTP...' : 'Verify OTP Code'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowOtp(false)}
              className="w-full text-center text-xs text-muted-foreground hover:text-primary transition-all mt-2 block"
            >
              Back to Password Login
            </button>
          </form>
        )}

        {/* Footer Credit */}
        <p className="text-center text-[10px] text-muted-foreground/60 mt-8 leading-none">
          SECURE CHANNEL • QUIZBUZZ PLATFORM INTERNAL ONLY
        </p>
      </motion.div>
    </div>
  );
}

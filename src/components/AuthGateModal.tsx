import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Lock, ShieldCheck, Truck, X } from 'lucide-react';
import { signInWithGoogle } from '../firebase';

interface AuthGateModalProps {
  open: boolean;
  reason?: string;
  onClose: () => void;
  onSuccess?: (signedInUser: User) => void;
}

export function AuthGateModal({ open, reason, onClose, onSuccess }: AuthGateModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      const cred = await signInWithGoogle();
      onSuccess?.(cred.user);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in right now.';
      if (!msg.includes('popup-closed-by-user')) {
        setError('Sign-in could not be completed. Please allow popups and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="relative w-full max-w-md bg-white border border-[#E5E7EB] p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign in dialog"
          className="absolute top-5 right-5 p-2 text-[#6B7280] hover:text-[#111317] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <p className="text-xs tracking-[0.14em] uppercase text-[#6B7280] mb-2">
          Customer Account
        </p>
        <h2 id="auth-modal-title" className="text-2xl font-semibold text-[#111317] mb-3">
          Sign in to continue
        </h2>
        <p className="text-sm text-[#4B5563] leading-relaxed mb-6">
          {reason ||
            'Please sign in before placing an order so we can protect your payment receipt, save your delivery details, and provide real-time order tracking.'}
        </p>

        <div className="space-y-3 border-t border-b border-[#E5E7EB] py-5 mb-6 text-xs text-[#4B5563]">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-[#111317] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Protected checkout with verified customer receipts and saved address.</span>
          </div>
          <div className="flex items-start gap-3">
            <Truck className="w-4 h-4 text-[#111317] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Live step-by-step order tracking from studio dispatch to delivery.</span>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-[#111317] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Verified customer reviews and instant order cancellation before dispatch.</span>
          </div>
        </div>

        {error && (
          <p className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-3 px-5 bg-[#111317] text-white text-sm font-medium hover:bg-[#272B33] disabled:opacity-60 transition-colors flex items-center justify-center gap-3 whitespace-nowrap"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.72 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.14 14.69 3.2 12.17 3.2 7.1 3.2 3 7.3 3 12.55s4.1 9.35 9.17 9.35c5.29 0 8.8-3.72 8.8-8.96 0-.6-.06-1.06-.14-1.84z"
            />
          </svg>
          <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
        </button>

        <p className="mt-4 text-[12px] text-[#6B7280] text-center">
          Verified Google Authentication powered by Firebase Security.
        </p>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartPulse,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, UserRole } from '../types';

export type AuthScreen = 'welcome' | 'login' | 'register' | 'forgot-password';

interface AuthPortalProps {
  screen: AuthScreen;
  notice?: string | null;
  onNavigate: (next: AuthScreen) => void;
  onAuthenticated: (user: AuthUser, token: string) => void;
}

const HERO_IMAGE_PATH = '/src/assets/images/ashasakhi_welcome_hero_1795287760269.jpg';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface PasswordCheck {
  label: string;
  passed: boolean;
}

function evaluatePassword(password: string): { checks: PasswordCheck[]; isStrong: boolean; score: number } {
  const checks: PasswordCheck[] = [
    { label: '8+ characters', passed: password.length >= 8 },
    { label: 'Uppercase letter', passed: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', passed: /[a-z]/.test(password) },
    { label: 'Number', passed: /[0-9]/.test(password) },
    { label: 'Special symbol', passed: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.passed).length;
  return { checks, isStrong: score === checks.length, score };
}

export function AuthPortal({ screen, notice, onNavigate, onAuthenticated }: AuthPortalProps) {
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Registration form state
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [role, setRole] = useState<UserRole>('asha');
  const [district, setDistrict] = useState('Raichur');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetMobile, setResetMobile] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const regPasswordEval = useMemo(() => evaluatePassword(regPassword), [regPassword]);
  const resetPasswordEval = useMemo(() => evaluatePassword(newPassword), [newPassword]);

  const switchScreen = (next: AuthScreen) => {
    setError(null);
    if (next !== 'login') {
      setSuccessMessage(null);
    }
    if (next !== 'forgot-password') {
      setResetToken(null);
    }
    onNavigate(next);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmedEmail = loginEmail.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!loginPassword) {
      setError('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password: loginPassword,
        }),
      });
      const data = await parseApiResponse<{ user: AuthUser; token: string }>(
        res,
        'Invalid email address or password.'
      );
      setLoginPassword('');
      onAuthenticated(data.user, String(data.token));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = regEmail.trim().toLowerCase();
    const trimmedMobile = mobileNumber.trim();
    const mobileDigits = trimmedMobile.replace(/\D/g, '');

    if (trimmedName.length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (mobileDigits.length < 10 || mobileDigits.length > 15) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!regPasswordEval.isStrong) {
      setError(
        'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol.'
      );
      return;
    }
    if (regPassword !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const selectedDistrict = KARNATAKA_DISTRICTS.find((d) => d.district === district);
      const phcCenter = selectedDistrict?.samplePhcs[0] || `PHC ${district}`;

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          full_name: trimmedName,
          email: trimmedEmail,
          mobile_number: trimmedMobile,
          password: regPassword,
          confirm_password: confirmPassword,
          role,
          district,
          phc_center: phcCenter,
        }),
      });
      const data = await parseApiResponse<{ user: AuthUser; token: string }>(
        res,
        'Could not complete registration.'
      );
      setRegPassword('');
      setConfirmPassword('');
      onAuthenticated(data.user, String(data.token));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to register account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyResetAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!EMAIL_PATTERN.test(resetEmail.trim())) {
      setError('Please enter your registered email address.');
      return;
    }
    if (resetMobile.replace(/\D/g, '').length < 10) {
      setError('Please enter your registered 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          email: resetEmail.trim(),
          mobile_number: resetMobile.trim(),
        }),
      });
      const data = await parseApiResponse<{ resetToken: string; message?: string }>(
        res,
        'Could not verify your account details.'
      );
      setResetToken(data.resetToken);
      setSuccessMessage(data.message || 'Account verified. Choose your new password below.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!resetToken) {
      setError('Verification expired. Please verify your email and mobile number again.');
      return;
    }
    if (!resetPasswordEval.isStrong) {
      setError(
        'New password must be at least 8 characters and include uppercase, lowercase, a number, and a special symbol.'
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          resetToken,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });
      const data = await parseApiResponse<{ message?: string }>(res, 'Could not reset password.');
      setResetToken(null);
      setNewPassword('');
      setConfirmNewPassword('');
      setLoginEmail(resetEmail.trim());
      setSuccessMessage(data.message || 'Password updated. Please sign in with your new password.');
      onNavigate('login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeBannerNotice = screen === 'login' ? notice : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f9f7] text-[#172622]">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-[#dce8e3] bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => switchScreen('welcome')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f6f5c] rounded-lg"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1f6f5c] text-white">
              <HeartPulse className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-[#142923]">
              AshaSakhi
            </span>
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav
            aria-label="Primary authentication navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#4a615b]"
          >
            <button
              type="button"
              onClick={() => switchScreen('welcome')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#142923] ${
                screen === 'welcome' ? 'text-[#1f6f5c] font-semibold' : ''
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => switchScreen('login')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#142923] ${
                screen === 'login' ? 'text-[#1f6f5c] font-semibold' : ''
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchScreen('register')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#142923] ${
                screen === 'register' ? 'text-[#1f6f5c] font-semibold' : ''
              }`}
            >
              Register
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            {screen === 'login' ? (
              <button
                type="button"
                onClick={() => switchScreen('register')}
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#1f6f5c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#185949] transition-colors whitespace-nowrap shrink-0"
              >
                Create Account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchScreen('login')}
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#1f6f5c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#185949] transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {screen === 'welcome' && (
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            {/* Hero 2-Column Split */}
            <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-6 flex flex-col justify-center">
                <p className="text-xs font-medium text-[#2d6a87]">
                  Community Health Platform · Multilingual Voice Care · Karnataka ASHA Network
                </p>

                <h1
                  className="mt-3 font-display font-bold tracking-tight text-[#122620]"
                  style={{ fontSize: 'clamp(2.15rem, 3.8vw, 3.25rem)', lineHeight: 1.12, textWrap: 'balance' }}
                >
                  Simple Voice Healthcare Support for Every Village Family
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-[#465c56]">
                  Welcome to AshaSakhi. Speak naturally in Kannada, Hindi, English, Telugu, Tamil, or
                  Marathi to receive plain-language health guidance, log household visits, track
                  maternal and child checkups, and escalate danger signs to PHC medical teams.
                </p>

                {/* Primary & Secondary Action Buttons */}
                <div className="mt-8 flex flex-wrap items-center gap-3.5">
                  <button
                    type="button"
                    onClick={() => switchScreen('login')}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#1f6f5c] px-6 py-3 text-sm font-semibold text-white hover:bg-[#175748] transition-colors whitespace-nowrap"
                  >
                    Sign In to Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => switchScreen('register')}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[#b8d8e8] bg-[#edf7fc] px-6 py-3 text-sm font-semibold text-[#0f4c6b] hover:bg-[#dff0f9] transition-colors whitespace-nowrap"
                  >
                    Register New Account
                  </button>
                </div>

                {/* Editorial Numbered Core Capabilities */}
                <div className="mt-10 grid grid-cols-1 gap-5 border-t border-[#dce8e3] pt-8 sm:grid-cols-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#1f6f5c] tabular-nums">01.</p>
                    <h2 className="mt-1 text-sm font-semibold text-[#142923]">Voice &amp; Audio Care</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[#526963]">
                      Record visits by voice, review transcripts, and listen to spoken guidance in 6 languages.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#1f6f5c] tabular-nums">02.</p>
                    <h2 className="mt-1 text-sm font-semibold text-[#142923]">Maternal &amp; Child Register</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[#526963]">
                      Track ANC visits, vaccinations, village families, health checkups, and follow-up dates.
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#0284c7] tabular-nums">03.</p>
                    <h2 className="mt-1 text-sm font-semibold text-[#142923]">Protected Role Access</h2>
                    <p className="mt-1 text-xs leading-relaxed text-[#526963]">
                      Encrypted credentials and role-based access for ASHA Workers and Healthcare Administrators.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Full-Height Editorial Healthcare Photography */}
              <div className="lg:col-span-6">
                <div className="relative h-full min-h-[340px] overflow-hidden rounded-2xl border border-[#d6e5df] bg-gradient-to-br from-[#e7f3ee] via-white to-[#e6f3fa]">
                  {!heroImageFailed ? (
                    <img
                      src={HERO_IMAGE_PATH}
                      alt="ASHA community health worker consulting warmly with a mother and toddler at a sunlit primary health center courtyard"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImageFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[340px] flex-col items-center justify-center p-8 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1f6f5c] text-white">
                        <HeartPulse className="h-8 w-8" />
                      </div>
                      <p className="mt-4 font-display text-lg font-semibold text-[#142923]">
                        AshaSakhi Community Health Network
                      </p>
                      <p className="mt-1 max-w-sm text-sm text-[#526963]">
                        Voice-first healthcare support for frontline ASHA workers and PHC supervisors.
                      </p>
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0e241f]/85 via-[#0e241f]/45 to-transparent p-6 text-white">
                    <p className="text-xs font-medium text-[#cfeae1]">
                      Frontline Primary Health Support · Karnataka NHM Aligned
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-white/95">
                      Designed for fast, compassionate household visits—combining speech-to-text,
                      audio readback, and verified district public health records in one secure portal.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Grounded Operational Proof Row */}
            <section className="mt-12 grid grid-cols-1 gap-4 rounded-2xl border border-[#dce8e3] bg-white p-6 sm:grid-cols-3 sm:divide-x sm:divide-[#e5efeb]">
              <div className="sm:pr-6">
                <p className="font-mono text-2xl font-bold text-[#1f6f5c] tabular-nums">6 Languages</p>
                <p className="mt-1 text-xs leading-relaxed text-[#526963]">
                  Kannada, Hindi, English, Telugu, Tamil, and Marathi voice recognition and spoken readback.
                </p>
              </div>
              <div className="sm:px-6">
                <p className="font-mono text-2xl font-bold text-[#0369a1] tabular-nums">13 Modules</p>
                <p className="mt-1 text-xs leading-relaxed text-[#526963]">
                  Unified workspace covering Speak &amp; Record, Visit Register, Danger Alerts, Maternal &amp; Child, and Reports.
                </p>
              </div>
              <div className="sm:pl-6">
                <p className="font-mono text-2xl font-bold text-[#142923] tabular-nums">31 Districts</p>
                <p className="mt-1 text-xs leading-relaxed text-[#526963]">
                  Official NFHS-5 Karnataka baselines paired with secure, authenticated field worker records.
                </p>
              </div>
            </section>
          </div>
        )}

        {(screen === 'login' || screen === 'register' || screen === 'forgot-password') && (
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
            <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
              {/* Left Healthcare Context Panel */}
              <aside className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-2xl border border-[#d6e7e2] bg-gradient-to-br from-[#eaf5f0] via-white to-[#eaf5fb] p-8">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1f6f5c] text-white">
                      <HeartPulse className="h-5 w-5" />
                    </span>
                    <span className="font-display text-lg font-bold text-[#142923]">AshaSakhi</span>
                  </div>

                  <h2
                    className="mt-7 font-display text-2xl font-bold tracking-tight text-[#122620]"
                    style={{ textWrap: 'balance' }}
                  >
                    {screen === 'register'
                      ? 'Create your secure community healthcare account'
                      : screen === 'forgot-password'
                      ? 'Recover access to your AshaSakhi account'
                      : 'Sign in to continue your community health work'}
                  </h2>

                  <p className="mt-3 text-sm leading-relaxed text-[#48605a]">
                    Every visit record, voice interaction, maternal checkup, and emergency alert is
                    protected behind verified worker authentication.
                  </p>

                  <div className="mt-8 space-y-4 border-t border-[#d8e7e2] pt-6">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1f6f5c]" />
                      <div>
                        <p className="text-xs font-semibold text-[#142923]">Hashed Password Protection</p>
                        <p className="mt-0.5 text-xs text-[#526963]">
                          Passwords are hashed securely on the server and never stored in plain text or browser storage.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#0369a1]" />
                      <div>
                        <p className="text-xs font-semibold text-[#142923]">Protected Dashboard &amp; Role Control</p>
                        <p className="mt-0.5 text-xs text-[#526963]">
                          Dedicated access for ASHA Workers and Healthcare Administrators with expiring server sessions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-8 text-xs leading-relaxed text-[#5c726c]">
                  AshaSakhi assists frontline community workers and does not replace qualified doctors.
                  For medical emergencies, call 108 immediately.
                </p>
              </aside>

              {/* Right Authentication Form Card */}
              <section className="lg:col-span-7 rounded-2xl border border-[#dce6e1] bg-white p-6 sm:p-8">
                {/* Inline Feedback Banners */}
                {activeBannerNotice && !error && (
                  <div
                    role="status"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#bae0f3] bg-[#eff8fd] px-4 py-3 text-sm text-[#0c4a6e]"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#0284c7]" />
                    <span>{activeBannerNotice}</span>
                  </div>
                )}

                {successMessage && (
                  <div
                    role="status"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-[#b7ddd0] bg-[#edf7f3] px-4 py-3 text-sm text-[#165949]"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1f6f5c]" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <span>{error}</span>
                  </div>
                )}

                {/* LOGIN FORM */}
                {screen === 'login' && (
                  <div>
                    <p className="text-xs font-medium text-[#2d6a87]">Existing Account Sign In</p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#122620]">
                      Sign In to AshaSakhi
                    </h1>
                    <p className="mt-1.5 text-sm text-[#526963]">
                      Enter your registered email address and password to open the dashboard.
                    </p>

                    <form onSubmit={handleLoginSubmit} className="mt-6 space-y-5" noValidate>
                      <div>
                        <label
                          htmlFor="login-email"
                          className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                        >
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                          <input
                            id="login-email"
                            type="email"
                            autoComplete="email"
                            required
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            placeholder="asha.worker@example.com"
                            className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#142923] placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label
                            htmlFor="login-password"
                            className="text-xs font-semibold text-[#2a3f39]"
                          >
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={() => switchScreen('forgot-password')}
                            className="text-xs font-medium text-[#0369a1] hover:text-[#075985] hover:underline"
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                          <input
                            id="login-password"
                            type={showLoginPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-11 text-sm text-[#142923] placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword((prev) => !prev)}
                            aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#5c726c] hover:bg-[#eff5f2]"
                          >
                            {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1f6f5c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#175748] disabled:opacity-60 transition-colors"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {submitting ? 'Signing In...' : 'Sign In'}
                      </button>
                    </form>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5efeb] pt-5 text-sm text-[#526963]">
                      <span>New to AshaSakhi?</span>
                      <button
                        type="button"
                        onClick={() => switchScreen('register')}
                        className="font-semibold text-[#1f6f5c] hover:text-[#155042] hover:underline"
                      >
                        Register an Account
                      </button>
                    </div>
                  </div>
                )}

                {/* REGISTRATION FORM */}
                {screen === 'register' && (
                  <div>
                    <p className="text-xs font-medium text-[#2d6a87]">New Healthcare Account</p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#122620]">
                      Register for AshaSakhi
                    </h1>
                    <p className="mt-1.5 text-sm text-[#526963]">
                      Create your ASHA Worker or Healthcare Administrator account to access field tools.
                    </p>

                    <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4" noValidate>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label
                            htmlFor="reg-fullname"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Full Name
                          </label>
                          <div className="relative">
                            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reg-fullname"
                              type="text"
                              autoComplete="name"
                              required
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="e.g. Lakshmi Devi"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#142923] placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-email"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Email Address
                          </label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reg-email"
                              type="email"
                              autoComplete="email"
                              required
                              value={regEmail}
                              onChange={(e) => setRegEmail(e.target.value)}
                              placeholder="name@example.com"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#142923] placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-mobile"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Mobile Number
                          </label>
                          <div className="relative">
                            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reg-mobile"
                              type="tel"
                              autoComplete="tel"
                              required
                              value={mobileNumber}
                              onChange={(e) => setMobileNumber(e.target.value)}
                              placeholder="e.g. 9876543210"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-3.5 font-mono text-sm text-[#142923] tabular-nums placeholder:font-sans placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-role"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Role
                          </label>
                          <select
                            id="reg-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value as UserRole)}
                            className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white px-3.5 py-2.5 text-sm text-[#142923] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                          >
                            <option value="asha">ASHA Worker</option>
                            <option value="supervisor">Healthcare Administrator</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-district"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            District
                          </label>
                          <select
                            id="reg-district"
                            value={district}
                            onChange={(e) => setDistrict(e.target.value)}
                            className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white px-3.5 py-2.5 text-sm text-[#142923] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                          >
                            {KARNATAKA_DISTRICTS.map((d) => (
                              <option key={d.district} value={d.district}>
                                {d.district}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-password"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Password
                          </label>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reg-password"
                              type={showRegPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              value={regPassword}
                              onChange={(e) => setRegPassword(e.target.value)}
                              placeholder="Create strong password"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-11 text-sm text-[#142923] placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                            <button
                              type="button"
                              onClick={() => setShowRegPassword((prev) => !prev)}
                              aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#5c726c] hover:bg-[#eff5f2]"
                            >
                              {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reg-confirm-password"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Confirm Password
                          </label>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reg-confirm-password"
                              type={showConfirmPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Re-enter password"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-11 text-sm text-[#142923] placeholder:text-[#8ba099] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword((prev) => !prev)}
                              aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#5c726c] hover:bg-[#eff5f2]"
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Password Strength Requirements */}
                      <div className="rounded-xl bg-[#f5f9f7] px-4 py-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#3b524c]">Password Strength</span>
                          <span
                            className={`font-semibold ${
                              regPasswordEval.score >= 5
                                ? 'text-[#1f6f5c]'
                                : regPasswordEval.score >= 3
                                ? 'text-[#0369a1]'
                                : 'text-[#5c726c]'
                            }`}
                          >
                            {regPassword.length === 0
                              ? 'Required'
                              : regPasswordEval.score >= 5
                              ? 'Strong'
                              : regPasswordEval.score >= 3
                              ? 'Fair'
                              : 'Weak'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          {regPasswordEval.checks.map((item) => (
                            <span
                              key={item.label}
                              className={`inline-flex items-center gap-1 ${
                                item.passed ? 'text-[#1f6f5c] font-medium' : 'text-[#6c807a]'
                              }`}
                            >
                              <Check className="h-3 w-3" />
                              {item.label}
                            </span>
                          ))}
                        </div>
                        {confirmPassword.length > 0 && confirmPassword !== regPassword && (
                          <p className="mt-2 text-xs font-medium text-red-700">
                            Passwords do not match yet.
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1f6f5c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#175748] disabled:opacity-60 transition-colors"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        {submitting ? 'Creating Account...' : 'Register'}
                      </button>
                    </form>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5efeb] pt-5 text-sm text-[#526963]">
                      <span>Already have an account?</span>
                      <button
                        type="button"
                        onClick={() => switchScreen('login')}
                        className="font-semibold text-[#1f6f5c] hover:text-[#155042] hover:underline"
                      >
                        Sign In
                      </button>
                    </div>
                  </div>
                )}

                {/* FORGOT PASSWORD FORM */}
                {screen === 'forgot-password' && (
                  <div>
                    <p className="text-xs font-medium text-[#2d6a87]">Account Recovery</p>
                    <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#122620]">
                      Reset Your Password
                    </h1>
                    <p className="mt-1.5 text-sm text-[#526963]">
                      {!resetToken
                        ? 'Verify your registered email address and mobile number to reset your password.'
                        : 'Enter a strong new password for your AshaSakhi account.'}
                    </p>

                    {!resetToken ? (
                      <form onSubmit={handleVerifyResetAccount} className="mt-6 space-y-4" noValidate>
                        <div>
                          <label
                            htmlFor="reset-email"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Registered Email Address
                          </label>
                          <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reset-email"
                              type="email"
                              required
                              value={resetEmail}
                              onChange={(e) => setResetEmail(e.target.value)}
                              placeholder="name@example.com"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-3.5 text-sm text-[#142923] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reset-mobile"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Registered Mobile Number
                          </label>
                          <div className="relative">
                            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reset-mobile"
                              type="tel"
                              required
                              value={resetMobile}
                              onChange={(e) => setResetMobile(e.target.value)}
                              placeholder="e.g. 9876543210"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-3.5 font-mono text-sm text-[#142923] tabular-nums focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1f6f5c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#175748] disabled:opacity-60 transition-colors"
                        >
                          {submitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <KeyRound className="h-4 w-4" />
                          )}
                          {submitting ? 'Verifying...' : 'Verify Account'}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleCompletePasswordReset} className="mt-6 space-y-4" noValidate>
                        <div>
                          <label
                            htmlFor="reset-new-password"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            New Password
                          </label>
                          <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b8079]" />
                            <input
                              id="reset-new-password"
                              type={showNewPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Create strong new password"
                              className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white py-2.5 pl-10 pr-11 text-sm text-[#142923] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword((prev) => !prev)}
                              aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#5c726c] hover:bg-[#eff5f2]"
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="reset-confirm-password"
                            className="mb-1.5 block text-xs font-semibold text-[#2a3f39]"
                          >
                            Confirm New Password
                          </label>
                          <input
                            id="reset-confirm-password"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="min-h-[44px] w-full rounded-xl border border-[#cddbd5] bg-white px-3.5 py-2.5 text-sm text-[#142923] focus:border-[#1f6f5c] focus:outline-none focus:ring-2 focus:ring-[#1f6f5c]/20"
                          />
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-[#f5f9f7] px-4 py-3 text-xs">
                          {resetPasswordEval.checks.map((item) => (
                            <span
                              key={item.label}
                              className={`inline-flex items-center gap-1 ${
                                item.passed ? 'text-[#1f6f5c] font-medium' : 'text-[#6c807a]'
                              }`}
                            >
                              <Check className="h-3 w-3" />
                              {item.label}
                            </span>
                          ))}
                        </div>

                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#1f6f5c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#175748] disabled:opacity-60 transition-colors"
                        >
                          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                          {submitting ? 'Updating Password...' : 'Update Password'}
                        </button>
                      </form>
                    )}

                    <div className="mt-6 flex items-center justify-between border-t border-[#e5efeb] pt-5 text-sm text-[#526963]">
                      <span>Remembered your password?</span>
                      <button
                        type="button"
                        onClick={() => switchScreen('login')}
                        className="font-semibold text-[#1f6f5c] hover:text-[#155042] hover:underline"
                      >
                        Back to Sign In
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Healthcare Footer */}
      <footer className="border-t border-[#dce8e3] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 text-xs text-[#5c726c] sm:px-6 lg:px-8">
          <span className="font-medium text-[#2c443e]">AshaSakhi · Simple Voice Healthcare Assistant</span>
          <span>For medical emergencies call 108 ambulance or visit the nearest PHC / FRU.</span>
        </div>
      </footer>
    </div>
  );
}

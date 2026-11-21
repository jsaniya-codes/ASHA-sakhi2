import React, { useState } from 'react';
import { X, ShieldCheck, UserPlus, LogIn } from 'lucide-react';
import { KARNATAKA_DISTRICTS } from '../data/nfhs5Karnataka';
import { parseApiResponse } from '../utils/apiClient';
import type { AuthUser, UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthUser, token: string) => void;
}

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('asha');
  const [district, setDistrict] = useState('Mysuru');
  const [phcCenter, setPhcCenter] = useState('PHC Nanjangud');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedDistrictMeta = KARNATAKA_DISTRICTS.find((d) => d.district === district);

  const handleDistrictChange = (nextDistrict: string) => {
    setDistrict(nextDistrict);
    const found = KARNATAKA_DISTRICTS.find((d) => d.district === nextDistrict);
    if (found && found.samplePhcs[0]) {
      setPhcCenter(found.samplePhcs[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'register'
          ? {
              username: username.trim(),
              full_name: fullName.trim(),
              password,
              role,
              district,
              phc_center: phcCenter.trim(),
            }
          : {
              username: username.trim(),
              password,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseApiResponse<{ user: AuthUser; token: string }>(
        res,
        'Authentication failed.'
      );

      onAuthenticated(data.user, String(data.token));
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to complete sign-in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-teal-700 shrink-0" />
            <h2 id="auth-modal-title" className="text-base font-semibold text-slate-900">
              {mode === 'register' ? 'Register ASHA / PHC Account' : 'Sign In to Field Register'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            aria-label="Close sign-in dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="auth-username" className="block text-xs font-medium text-slate-700 mb-1.5">
              ASHA ID or Username
            </label>
            <input
              id="auth-username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. asha_mysuru_01"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Lakshmi Devi"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-role" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Field Role
                  </label>
                  <select
                    id="auth-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  >
                    <option value="asha">ASHA Worker</option>
                    <option value="supervisor">PHC Supervisor</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="auth-district" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Karnataka District
                  </label>
                  <select
                    id="auth-district"
                    value={district}
                    onChange={(e) => handleDistrictChange(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  >
                    {KARNATAKA_DISTRICTS.map((d) => (
                      <option key={d.district} value={d.district}>
                        {d.district}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="auth-phc" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Primary Health Center (PHC)
                </label>
                <input
                  id="auth-phc"
                  type="text"
                  required
                  value={phcCenter}
                  onChange={(e) => setPhcCenter(e.target.value)}
                  list="phc-suggestions"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                />
                <datalist id="phc-suggestions">
                  {selectedDistrictMeta?.samplePhcs.map((phc) => (
                    <option key={phc} value={phc} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 mb-1.5">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
            />
          </div>

          <p className="text-xs text-slate-500">
            Session credentials are verified on the server and kept strictly in active memory while you work.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'register'
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

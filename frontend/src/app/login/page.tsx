'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { apiFetch, setStoredManager, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      setToken(res.access_token);
      setStoredManager(res.manager);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070a10] flex items-center justify-center p-4">
      {/* Background radial accent glow */}
      <div className="absolute w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none -top-20 -right-20" />

      <div className="w-full max-w-md relative glass-panel rounded-2xl p-8 border border-industrial-700/60 shadow-2xl shadow-black/80">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-safety-blue to-safety-cyan items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/30">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AEGIS Safety Vision</h1>
          <p className="text-xs text-gray-400 mt-1 font-mono tracking-wider">
            INDUSTRIAL AI OPERATIONS PLATFORM
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-200 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5 uppercase font-mono tracking-wider">
              Manager Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-industrial-950/80 border border-industrial-700 rounded-lg text-sm text-white focus:outline-none focus:border-safety-cyan transition-colors"
                placeholder="admin"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5 uppercase font-mono tracking-wider">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-industrial-950/80 border border-industrial-700 rounded-lg text-sm text-white focus:outline-none focus:border-safety-cyan transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Authenticating...
              </span>
            ) : (
              <>
                <span>Access Operations Center</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-industrial-800 text-center">
          <div className="text-[11px] font-mono text-gray-400">
            Default Prototype Access: <span className="text-gray-300 font-semibold">admin</span> / <span className="text-gray-300 font-semibold">admin123</span>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            Compliant with ISO 45001 Industrial Workplace AI Standards
          </div>
        </div>
      </div>
    </div>
  );
}

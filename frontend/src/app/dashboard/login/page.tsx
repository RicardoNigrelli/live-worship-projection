"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function DashboardLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  
  const submitLogin = async (body: { password?: string; demo?: boolean }) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        router.push('/dashboard');
      } else {
        setError(data.error || 'Acceso denegado');
      }
    } catch (err) {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    submitLogin({ password });
  };

  const handleDemoLogin = () => submitLogin({ demo: true });

  return (
    <div className="min-h-screen bg-urban-bg flex flex-col justify-center items-center p-4">
      <div className="bg-urban-surface p-8 max-w-sm w-full border border-gray-200">
        <h1 className="font-display font-bold text-3xl mb-6 text-urban-black-900 border-b-4 border-urban-teal-500 inline-block pb-1">
          Admin Dashboard
        </h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block font-semibold text-sm mb-1 text-urban-text">Contraseña</label>
            <input 
              type="password"
              autoFocus
              className="w-full border-2 border-urban-black-900 p-2 focus:outline-none focus:border-urban-teal-500 font-body transition-colors"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-urban-coral-400 font-bold text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-urban-black-900 text-urban-surface py-3 px-4 font-bold tracking-wider hover:bg-urban-teal-500 urban-transition disabled:opacity-50"
          >
            {loading ? 'VERIFICANDO...' : 'ENTRAR'}
          </button>
        </form>
        <button
          type="button"
          onClick={handleDemoLogin}
          disabled={loading}
          className="mt-3 w-full border-2 border-urban-teal-500 text-urban-teal-500 py-3 px-4 font-bold tracking-wider hover:bg-urban-teal-500 hover:text-urban-surface urban-transition disabled:opacity-50"
        >
          VER DEMO (SIN CONTRASEÑA)
        </button>
        <p className="text-center text-xs text-urban-text/60 mt-4">
          Pieza de portafolio — datos sintéticos, sin datos reales de ninguna iglesia
        </p>
      </div>
    </div>
  );
}

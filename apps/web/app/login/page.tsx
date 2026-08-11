'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '../lib/storefront-client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/cart';

  const [phone, setPhone] = useState('+919999999999');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to send OTP');
      }

      setMessage(data.message || 'OTP sent successfully!');
      setStep('VERIFY');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Invalid verification code');
      }

      if (data.accessToken) {
        sessionStorage.setItem('luxe_buyer_token', data.accessToken);
        sessionStorage.setItem('luxe_seller_token', data.accessToken);
        sessionStorage.setItem('luxe_admin_token', data.accessToken);
        localStorage.setItem('luxe_buyer_token', data.accessToken);
        localStorage.setItem('luxe_seller_token', data.accessToken);
        localStorage.setItem('luxe_admin_token', data.accessToken);

        if (data.refreshToken) {
          sessionStorage.setItem('luxe_refresh_token', data.refreshToken);
          localStorage.setItem('luxe_refresh_token', data.refreshToken);
        }

        router.push(redirectTarget);
      } else {
        throw new Error('No access token returned from server');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', color: '#f4f4f5', padding: '24px' }}>
      <div className="glass-panel" style={{ maxWidth: '420px', width: '100%', padding: '32px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(18, 18, 20, 0.8)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, textAlign: 'center', marginBottom: '8px' }}>
          Platform Account Login
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#a1a1aa', textAlign: 'center', marginBottom: '24px' }}>
          Enter your mobile phone number to log in via OTP
        </p>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '12px', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '12px', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '16px' }}>
            {message}
          </div>
        )}

        {step === 'REQUEST' ? (
          <form onSubmit={handleRequestOtp} style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919999999999"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #27272a', background: '#18181b', color: '#fff' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary, #6366f1)', color: '#fff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Sending OTP...' : 'Request OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                Enter 6-Digit OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #27272a', background: '#18181b', color: '#fff', letterSpacing: '4px', textAlign: 'center', fontSize: '1.25rem' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ padding: '12px', borderRadius: '8px', border: 'none', background: 'var(--accent-primary, #6366f1)', color: '#fff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Verifying...' : 'Verify OTP & Log In'}
            </button>
            <button
              type="button"
              onClick={() => setStep('REQUEST')}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', fontSize: '0.875rem', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Change Phone Number
            </button>
          </form>
        )}

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.875rem', color: '#71717a' }}>
          <Link href="/" style={{ color: '#a1a1aa' }}>Return to Storefront</Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading authentication...</div>}>
      <LoginContent />
    </Suspense>
  );
}

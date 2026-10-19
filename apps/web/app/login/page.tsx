'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL, getUserRolesFromToken } from '../lib/storefront-client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/cart';

  const [phoneDigits, setPhoneDigits] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [step, setStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fullPhone = `+91${phoneDigits}`;

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneDigits.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    setDemoOtp(null);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to send OTP');
      }

      setMessage(data.message || 'OTP sent successfully!');
      if (data.demoOtp) {
        setDemoOtp(data.demoOtp);
      }
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
        body: JSON.stringify({ phone: fullPhone, code: otp }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Invalid verification code');
      }

      if (data.accessToken) {
        sessionStorage.setItem('luxe_buyer_token', data.accessToken);
        const roles = getUserRolesFromToken(data.accessToken);

        if (roles.includes('SELLER')) {
          sessionStorage.setItem('luxe_seller_token', data.accessToken);
        }
        if (roles.includes('ADMIN')) {
          sessionStorage.setItem('luxe_admin_token', data.accessToken);
        }

        if (data.refreshToken) {
          sessionStorage.setItem('luxe_refresh_token', data.refreshToken);
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '24px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '420px',
          width: '100%',
          padding: '32px',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          Platform Account Login
        </h2>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            marginBottom: '24px',
          }}
        >
          Enter your mobile phone number to log in via OTP
        </p>

        {error && (
          <div
            style={{
              backgroundColor: 'var(--status-danger-bg)',
              color: 'var(--status-danger-text)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            style={{
              backgroundColor: 'var(--status-success-bg)',
              color: 'var(--status-success-text)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '16px',
            }}
          >
            {message}
          </div>
        )}

        {demoOtp && (
          <div
            style={{
              backgroundColor: 'var(--accent-gold-bg, #FBEEDA)',
              border: '1px solid var(--accent-gold, #B0700E)',
              color: 'var(--accent-gold, #B0700E)',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              marginBottom: '16px',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            Demo mode — your OTP is {demoOtp}
          </div>
        )}

        {step === 'REQUEST' ? (
          <form
            onSubmit={handleRequestOtp}
            style={{ display: 'grid', gap: '16px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                Mobile Number
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                  background: 'var(--bg-elevated)',
                }}
              >
                <span
                  style={{
                    padding: '12px 14px',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    borderRight: '1px solid var(--border-subtle)',
                    userSelect: 'none',
                  }}
                >
                  +91
                </span>
                <input
                  type="tel"
                  value={phoneDigits}
                  onChange={(e) =>
                    setPhoneDigits(
                      e.target.value.replace(/\D/g, '').slice(0, 10),
                    )
                  }
                  placeholder="9876543210"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  required
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading || phoneDigits.length !== 10}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-primary)',
                color: '#fff',
                fontWeight: 700,
                cursor:
                  loading || phoneDigits.length !== 10
                    ? 'not-allowed'
                    : 'pointer',
                opacity: phoneDigits.length === 10 ? 1 : 0.6,
              }}
            >
              {loading ? 'Sending OTP...' : 'Request OTP'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyOtp}
            style={{ display: 'grid', gap: '16px' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-secondary)',
                }}
              >
                Enter 6-Digit OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="••••••"
                maxLength={6}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  letterSpacing: '6px',
                  textAlign: 'center',
                  fontSize: '1.25rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-primary)',
                color: '#fff',
                fontWeight: 700,
                cursor:
                  loading || otp.length !== 6 ? 'not-allowed' : 'pointer',
                opacity: otp.length === 6 ? 1 : 0.6,
              }}
            >
              {loading ? 'Verifying...' : 'Verify OTP & Log In'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('REQUEST');
                setOtp('');
                setDemoOtp(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Change Phone Number
            </button>
          </form>
        )}

        <div
          style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-muted)',
          }}
        >
          <Link href="/" style={{ color: 'var(--text-secondary)' }}>
            Return to Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Loading authentication...
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

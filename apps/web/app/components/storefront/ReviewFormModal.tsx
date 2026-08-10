'use client';

import React, { useState } from 'react';
import { createReview } from '../../lib/storefront-client';

interface ReviewFormModalProps {
  productId: string;
  productName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewFormModal({
  productId,
  productName,
  isOpen,
  onClose,
  onSuccess,
}: ReviewFormModalProps) {

  const [rating, setRating] = useState<number>(5);
  const [title, setTitle] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const storedToken = sessionStorage.getItem('luxe_buyer_token') || localStorage.getItem('luxe_buyer_token');
    if (!storedToken) {
      setErrorMessage('Please log in to submit a review for this product.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      await createReview(storedToken, {
        productId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim() || undefined,
      });

      setSuccessMessage('✓ Review submitted successfully! Thank you for your feedback.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      const errorObj = err as Error & { status?: number };
      if (errorObj.status === 403) {
        setErrorMessage('🔒 Verified Purchase Required: Only buyers who have purchased this product can leave a review.');
      } else if (errorObj.status === 409) {
        setErrorMessage('⚠️ Duplicate Review: You have already submitted a review for this product.');
      } else {
        setErrorMessage(errorObj.message || 'Review submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '520px',
          width: '100%',
          padding: '32px',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            right: '16px',
            top: '16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '1.25rem',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
          Write a Review
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '20px' }}>
          Sharing feedback for <strong>{productName}</strong>
        </p>

        {errorMessage && (
          <div className="alert alert-danger" style={{ marginBottom: '16px', fontSize: '0.8125rem' }}>
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success" style={{ marginBottom: '16px', fontSize: '0.8125rem' }}>
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit}>


          {/* Star Rating Selector */}
          <div className="form-group">
            <label className="form-label">Rating (1 to 5 Stars)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  style={{
                    fontSize: '1.5rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: star <= rating ? '#fbbf24' : 'var(--text-muted)',
                  }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* Review Title */}
          <div className="form-group">
            <label className="form-label">Review Headline</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Excellent quality and perfect fit!"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Review Comment */}
          <div className="form-group">
            <label className="form-label">Detailed Review</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="Describe material, sizing, comfort, and finish..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

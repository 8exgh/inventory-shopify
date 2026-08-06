'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export function FeedbackFooter() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!localStorage.getItem('token'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) {
      return;
    }

    setSending(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/commands/submit-feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: trimmed })
      });

      if (response.ok) {
        setMessage('');
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      } else if (response.status === 429) {
        setError('Please wait a minute between feedback submissions.');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-2xl items-center gap-2"
      >
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={sent ? 'Thanks for the feedback!' : 'Have feedback? Tell us...'}
          maxLength={2000}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={sending || !message.trim()}
          className="rounded-md bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-800 disabled:bg-gray-300"
        >
          Send
        </button>
        {loggedIn && (
          <Link
            href="/feedback"
            className="whitespace-nowrap text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            View feedback
          </Link>
        )}
      </form>
      {error && (
        <p className="mx-auto mt-1 max-w-2xl text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

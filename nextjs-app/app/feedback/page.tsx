'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';

interface FeedbackEntry {
  id: number;
  message: string;
  email: string | null;
  created_at: number;
}

export default function FeedbackList() {
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    loadFeedback(token);
  }, []);

  async function loadFeedback(token: string) {
    try {
      const response = await fetch('/api/queries/feedback', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        router.push('/');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setEntries(data.feedback);
      }
    } catch (error) {
      console.error('Failed to load feedback:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-3xl mx-auto p-4">
        <div className="mb-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-blue-600 hover:text-blue-800"
          >
            &larr; Back to Dashboard
          </button>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">Feedback</h1>

        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No feedback yet. Be the first &mdash; there's a box at the bottom of
            every page.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map(entry => (
              <div key={entry.id} className="bg-white rounded-lg shadow p-4">
                <p className="text-gray-900 whitespace-pre-wrap break-words">{entry.message}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {entry.email || 'Anonymous'} &middot; {formatDate(entry.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

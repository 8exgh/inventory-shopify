'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { embeddedFetch } from '@/lib/embedded/api';
import { Spinner } from '@/components/Spinner';

interface StaffUser {
  id: string;
  email: string;
  role: string;
  must_change_password: number;
}

export default function EmbeddedStaff() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const response = await embeddedFetch('/api/admin/users');
      if (response.ok) {
        setUsers((await response.json()).users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const response = await embeddedFetch('/api/admin/create-user', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: 'restocker' })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to create account');
      } else {
        setMessage(`Account created. Share the email + temporary password with your staff - they log in at inventory-reload.fusenv.com and set their own password.`);
        setEmail('');
        setPassword('');
        loadUsers();
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <button onClick={() => router.push('/embedded')} className="mb-4 text-blue-600 hover:text-blue-800">
        &larr; Back
      </button>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Staff accounts</h1>
        <p className="text-sm text-gray-500 mb-4">
          Staff photograph discs from their phones at{' '}
          <span className="font-mono">inventory-reload.fusenv.com</span>. They can't manage
          your store or other settings.
        </p>

        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary password</label>
            <input
              type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900"
            />
          </div>
          <button
            type="submit" disabled={creating}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center gap-2"
          >
            {creating && <Spinner />}
            <span>Create</span>
          </button>
        </form>

        {message && <div className="mt-3 p-3 bg-green-100 text-green-800 rounded text-sm">{message}</div>}
        {error && <div className="mt-3 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-500">No staff accounts yet.</td></tr>
            ) : users.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-3 text-sm text-gray-900">{user.email}</td>
                <td className="px-6 py-3 text-sm text-gray-500">{user.role}</td>
                <td className="px-6 py-3 text-sm text-gray-500">
                  {user.must_change_password === 1 ? 'Awaiting first login' : 'Active'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

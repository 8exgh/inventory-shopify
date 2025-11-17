import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAdmin } from '@/lib/auth/middleware';
import { createUser, getUserByEmail } from '@/lib/db/system';
import { hashPassword, validatePassword } from '@/lib/auth/password';

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'restocker'])
});

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    const auth = requireAdmin(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validation = CreateUserSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password, role } = validation.data;

    // Check if user already exists
    const existingUser = getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Create user (must change password on first login)
    const userId = uuidv4();
    createUser({
      id: userId,
      email,
      password_hash,
      role,
      must_change_password: 1
    });

    return NextResponse.json({ userId });
  } catch (error: any) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

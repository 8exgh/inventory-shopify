import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { hasAnyUsers, createUser } from '@/lib/db/system';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: NextRequest) {
  try {
    // Check if any users exist
    if (hasAnyUsers()) {
      return NextResponse.json(
        { error: 'First admin user already exists' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = RegisterSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

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

    // Create admin user
    const userId = uuidv4();
    createUser({
      id: userId,
      email,
      password_hash,
      role: 'admin',
      must_change_password: 0
    });

    // Generate JWT
    const token = signToken({ userId, role: 'admin' });

    return NextResponse.json({ userId, token });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

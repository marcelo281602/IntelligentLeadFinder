'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';

const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

export async function signIn(formData: FormData): Promise<void> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/sign-in?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }
  enforceRateLimit(`signin:${parsed.data.email}`, 10, 60_000);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    redirect(`/sign-in?error=${encodeURIComponent('Invalid email or password.')}`);
  }
  const next = String(formData.get('next') ?? '/');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function signUp(formData: FormData): Promise<void> {
  const parsed = credentialsSchema
    .extend({ fullName: z.string().trim().min(1, 'Your name is required').max(120) })
    .safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      fullName: formData.get('fullName'),
    });
  if (!parsed.success) {
    redirect(`/sign-up?error=${encodeURIComponent(parsed.error.issues[0]!.message)}`);
  }
  enforceRateLimit(`signup:${parsed.data.email}`, 5, 60_000);
  const supabase = await createSupabaseServerClient();

  // Frictionless default: accounts are created pre-confirmed and signed in
  // immediately — no verification email between "create workspace" and using
  // the product. Set AUTH_EMAIL_VERIFICATION=required to restore the
  // verification-email flow (kept below; Resend integration planned).
  if (process.env.AUTH_EMAIL_VERIFICATION !== 'required') {
    const { createServiceClient } = await import('@/lib/supabase/service');
    const service = createServiceClient();
    const created = await service.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.fullName },
    });
    if (created.error) {
      const message = /already/i.test(created.error.message)
        ? 'An account with that email already exists — sign in instead.'
        : created.error.message;
      redirect(`/sign-up?error=${encodeURIComponent(message)}`);
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (signInError) {
      redirect(`/sign-in?error=${encodeURIComponent('Account created — please sign in.')}`);
    }
    redirect('/onboarding');
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  });
  if (error) {
    redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/sign-up?sent=1');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = z.string().email().safeParse(formData.get('email'));
  if (!email.success) {
    redirect(`/reset-password?error=${encodeURIComponent('Enter a valid email address.')}`);
  }
  enforceRateLimit(`reset:${email.data}`, 3, 300_000);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password/update`,
  });
  // Always confirm — never reveal whether the account exists.
  redirect('/reset-password?sent=1');
}

export async function updatePassword(formData: FormData): Promise<void> {
  const password = z.string().min(8).safeParse(formData.get('password'));
  if (!password.success) {
    redirect(
      `/reset-password/update?error=${encodeURIComponent('Password must be at least 8 characters.')}`,
    );
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) {
    redirect(`/reset-password/update?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/');
}

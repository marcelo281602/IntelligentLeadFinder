'use server';

import { revalidatePath } from 'next/cache';
import { requireOrg } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function markAllNotificationsRead(): Promise<void> {
  const ctx = await requireOrg();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', ctx.orgId)
    .eq('user_id', ctx.userId)
    .is('read_at', null);
  revalidatePath('/notifications');
}

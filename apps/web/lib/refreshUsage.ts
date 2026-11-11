import { authApi } from './api';
import { useAuthStore } from './stores/authStore';

/** Re-reads the signed-in user (storage usage, quota, admin rights) after something changed the counter. */
export async function refreshUsage(): Promise<void> {
  try {
    const res = await authApi.getMe();
    useAuthStore.getState().setUser(res.data);
  } catch {
    // best effort: the bar just stays stale until the next refresh
  }
}

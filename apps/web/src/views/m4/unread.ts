import { ref } from 'vue';
import { m4 } from '../../m4';

export const unreadCount = ref(0);

export async function refreshUnread() {
  try {
    unreadCount.value = (await m4.notifications.unreadCount()).count;
  } catch {
    unreadCount.value = 0;
  }
}

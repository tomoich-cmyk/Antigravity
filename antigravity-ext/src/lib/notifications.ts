import { loadState, saveState } from './storage';
import type { NotificationRecord } from '../types';

export async function dispatchNotifications(notifs: NotificationRecord[]) {
  if (notifs.length === 0) return;
  
  const state = await loadState();
  if (!state.notifications) state.notifications = [];
  if (!state.notificationHistory) state.notificationHistory = [];
  
  for (const notif of notifs) {
    state.notifications.push(notif);
    state.notificationHistory.push({ ...notif });
    
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          new Notification('Antigravity', {
            body: notif.message,
            icon: '/favicon.svg'
          });
        }
      } catch (e) {
          console.warn("Notification create error:", e);
      }
    }
  }

  await saveState(state);
}

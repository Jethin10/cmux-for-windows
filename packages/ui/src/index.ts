export interface SessionBadgeViewModel {
  title: string;
  status: string;
  unreadCount: number;
}

export function formatSessionBadge(session: SessionBadgeViewModel): string {
  const unread = session.unreadCount > 0 ? ` (${session.unreadCount})` : "";
  return `${session.title} · ${session.status}${unread}`;
}

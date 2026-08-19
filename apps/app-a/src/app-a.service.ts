import { Injectable } from '@nestjs/common';
import { AppAPrismaService } from '@app/app-a-database';
import type { LocalSessionView } from './auth/app-auth.service';

type ActivityItem = {
  message: string;
  correlationId: string | null;
  createdAt: Date;
};

type EventItem = {
  eventId: string;
  eventType: string;
  processedAt: Date;
  result: string;
};

@Injectable()
export class AppAService {
  constructor(private readonly prisma: AppAPrismaService) {}

  async renderHome(
    auth: LocalSessionView | null,
    errorRequestId?: string,
  ): Promise<string> {
    const [activity, events] = await Promise.all([
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.processedEvent.findMany({
        orderBy: { processedAt: 'desc' },
        take: 20,
      }),
    ]);
    const content = auth
      ? this.renderAuthenticated(auth, activity, events)
      : this.renderLoggedOut();
    const error = errorRequestId
      ? `<div class="alert alert-error" role="alert"><span>Sign-in failed. Please try again.</span><span class="small mono">Request ID: ${this.escape(errorRequestId)}</span></div>`
      : '';

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>App A · SSO Demo</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="theme-a">
${error}
${content}
</body>
</html>`;
  }

  private renderLoggedOut(): string {
    return `<main class="hero">
  <div class="hero-mark">A</div>
  <p class="eyebrow">Relying application</p>
  <h1 class="app-accent">APP A</h1>
  <p class="muted hero-copy">Sign in through the identity provider. App A stores only a separate, short-lived local session.</p>
  <a class="btn btn-app btn-lg" href="/login">Sign in with SSO</a>
  <div class="security-note">Your password is never shared with App A.</div>
</main>`;
  }

  private renderAuthenticated(
    auth: LocalSessionView,
    activity: ActivityItem[],
    events: EventItem[],
  ): string {
    const initials = auth.user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
    const groups = auth.user.groups.length
      ? auth.user.groups
          .map(
            (group) =>
              `<span class="badge badge-neutral">${this.escape(group)}</span>`,
          )
          .join(' ')
      : '<span class="muted">No groups</span>';
    const activityRows = activity.length
      ? activity
          .map(
            (item) => `<li class="log-item">
  <time class="log-time" datetime="${item.createdAt.toISOString()}">${this.formatDate(item.createdAt)}</time>
  <span class="log-msg">${this.escape(item.message)}</span>
  <span class="log-id">${item.correlationId ? this.escape(this.shorten(item.correlationId)) : '—'}</span>
</li>`,
          )
          .join('')
      : '<li class="empty-state">No activity recorded yet.</li>';
    const eventRows = events.length
      ? events
          .map(
            (event) => `<tr>
  <td><span class="mono" title="${this.escape(event.eventId)}">${this.escape(this.shorten(event.eventId))}</span></td>
  <td><span class="badge badge-neutral">${this.escape(event.eventType)}</span></td>
  <td class="mono small">${this.formatDate(event.processedAt)}</td>
  <td>${this.escape(event.result)}</td>
</tr>`,
          )
          .join('')
      : '<tr><td class="empty-state" colspan="4">No provider events processed yet.</td></tr>';

    return `<header class="app-header">
  <div class="row-between shell">
    <div><p class="header-kicker">SSO demo application</p><h1>APP A</h1></div>
    <form id="logout-form" method="post" action="/logout"><button class="btn" type="submit">Sign out of App A</button></form>
  </div>
</header>
<main class="app-container stack">
  <div class="grid grid-2">
    <section class="card" aria-labelledby="identity-heading">
      <p class="eyebrow">Signed-in identity</p>
      <div class="user-row">
        <div class="avatar" aria-hidden="true">${this.escape(initials)}</div>
        <div><h2 id="identity-heading">Hello, ${this.escape(auth.user.name)}</h2><div class="muted">${this.escape(auth.user.email)}</div></div>
      </div>
      <div class="group-row"><span class="small muted">Groups</span><div>${groups}</div></div>
      <div class="small muted cache-time">Profile synced ${this.formatDate(auth.user.syncedAt)}</div>
    </section>
    <section class="card" aria-labelledby="session-heading">
      <div class="card-header"><div><p class="eyebrow">App A only</p><h2 id="session-heading">Local session</h2></div><span class="badge badge-active">Active</span></div>
      <div class="kv"><span class="muted">Created</span><time class="mono">${this.formatDate(auth.session.createdAt)}</time></div>
      <div class="kv"><span class="muted">Expires</span><time class="mono">${this.formatDate(auth.session.expiresAt)}</time></div>
      <div class="kv"><span class="muted">Last activity</span><time class="mono">${this.formatOptionalDate(auth.session.lastActivityAt)}</time></div>
      <div class="kv"><span class="muted">Time remaining</span><span class="mono" id="countdown" data-expires-at="${auth.session.expiresAt.toISOString()}">—</span></div>
    </section>
  </div>
  <section class="card">
    <div class="card-header"><div><p class="eyebrow">Latest 20 entries</p><h2>Activity log</h2></div><span class="small muted">Local application flow</span></div>
    <ul class="log-list">${activityRows}</ul>
  </section>
  <section class="card">
    <div class="card-header"><div><p class="eyebrow">Provider notifications</p><h2>Processed events</h2></div><span class="small muted">Idempotent event history</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Event ID</th><th>Type</th><th>Processed at</th><th>Result</th></tr></thead><tbody>${eventRows}</tbody></table></div>
  </section>
</main>
<script>
const countdown = document.getElementById('countdown');
const updateCountdown = () => {
  if (!countdown) return;
  const remaining = Math.max(0, Date.parse(countdown.dataset.expiresAt || '') - Date.now());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  countdown.textContent = [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
};
updateCountdown();
setInterval(updateCountdown, 1000);
document.getElementById('logout-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch('/logout', { method: 'POST' });
  if (response.ok) window.location.assign('/');
});
</script>`;
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private shorten(value: string): string {
    return value.length > 14 ? `${value.slice(0, 12)}…` : value;
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Asia/Jakarta',
    }).format(value);
  }

  private formatOptionalDate(value: Date | null): string {
    return value ? this.formatDate(value) : 'No activity yet';
  }
}

import { Injectable } from '@nestjs/common';
import { AppBPrismaService } from '@app/app-b-database';
import type { LocalSessionView } from './auth/app-auth.service';

@Injectable()
export class AppBService {
  constructor(private readonly prisma: AppBPrismaService) {}

  async renderHome(
    auth: LocalSessionView | null,
    errorRequestId?: string,
  ): Promise<string> {
    const [logs, events] = await Promise.all([
      this.prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.processedEvent.findMany({
        orderBy: { processedAt: 'desc' },
        take: 20,
      }),
    ]);
    const error = errorRequestId
      ? `<div class="alert alert-error"><span>Sign-in failed. Please try again.</span><span class="small mono">Request ID: ${this.escape(errorRequestId)}</span></div>`
      : '';
    const content = auth
      ? `<header class="app-header"><div class="row-between shell"><div><p class="header-kicker">SSO demo application</p><h1>APP B</h1></div><form id="logout-form" action="/logout" method="post"><button class="btn">Sign out of App B</button></form></div></header>
<main class="app-container stack"><div class="grid grid-2"><section class="card"><p class="eyebrow">Signed-in identity</p><div class="user-row"><div class="avatar">${this.initials(auth.user.name)}</div><div><h2>Hello, ${this.escape(auth.user.name)}</h2><div class="muted">${this.escape(auth.user.email)}</div></div></div><div class="group-row"><span class="small muted">Groups</span><div>${this.groups(auth.user.groups)}</div></div><div class="small muted cache-time">Profile synced ${this.date(auth.user.syncedAt)}</div></section>
<section class="card"><div class="card-header"><div><p class="eyebrow">App B only</p><h2>Local session</h2></div><span class="badge badge-active">Active</span></div><div class="kv"><span class="muted">Created</span><span class="mono">${this.date(auth.session.createdAt)}</span></div><div class="kv"><span class="muted">Expires</span><span class="mono">${this.date(auth.session.expiresAt)}</span></div><div class="kv"><span class="muted">Last activity</span><span class="mono">${auth.session.lastActivityAt ? this.date(auth.session.lastActivityAt) : 'No activity yet'}</span></div><div class="kv"><span class="muted">Time remaining</span><span class="mono" id="countdown" data-expires-at="${auth.session.expiresAt.toISOString()}">—</span></div></section></div>
<section class="card"><div class="card-header"><div><p class="eyebrow">Latest 20 entries</p><h2>Activity log</h2></div></div><ul class="log-list">${logs.length ? logs.map((log) => `<li class="log-item"><time class="log-time">${this.date(log.createdAt)}</time><span class="log-msg">${this.escape(log.message)}</span><span class="log-id">${log.correlationId ? this.short(log.correlationId) : '—'}</span></li>`).join('') : '<li class="empty-state">No activity recorded yet.</li>'}</ul></section>
<section class="card"><div class="card-header"><div><p class="eyebrow">Provider notifications</p><h2>Processed events</h2></div><span class="small muted">Idempotent event history</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Event ID</th><th>Type</th><th>Processed at</th><th>Result</th></tr></thead><tbody>${events.length ? events.map((event) => `<tr><td class="mono" title="${this.escape(event.eventId)}">${this.short(event.eventId)}</td><td><span class="badge badge-neutral">${this.escape(event.eventType)}</span></td><td class="mono small">${this.date(event.processedAt)}</td><td>${this.escape(event.result)}</td></tr>`).join('') : '<tr><td class="empty-state" colspan="4">No provider events processed yet.</td></tr>'}</tbody></table></div></section></main>
<script>const el=document.getElementById('countdown');const tick=()=>{if(!el)return;const left=Math.max(0,Date.parse(el.dataset.expiresAt||'')-Date.now());el.textContent=[Math.floor(left/3600000),Math.floor(left%3600000/60000),Math.floor(left%60000/1000)].map(value=>String(value).padStart(2,'0')).join(':')};tick();setInterval(tick,1000);document.getElementById('logout-form')?.addEventListener('submit',async event=>{event.preventDefault();const response=await fetch('/logout',{method:'POST'});if(response.ok)window.location.assign('/')});</script>`
      : `<main class="hero"><div class="hero-mark">B</div><p class="eyebrow">Relying application</p><h1>APP B</h1><p class="muted hero-copy">Sign in through the identity provider. App B keeps an independent local session.</p><a class="btn btn-app btn-lg" href="/login">Sign in with SSO</a><div class="security-note">Your password is never shared with App B.</div></main>`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>App B · SSO Demo</title><link rel="stylesheet" href="/styles.css"></head><body class="theme-b">${error}${content}</body></html>`;
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private initials(name: string): string {
    return this.escape(
      name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join(''),
    );
  }

  private groups(groups: string[]): string {
    return groups.length
      ? groups
          .map(
            (group) =>
              `<span class="badge badge-neutral">${this.escape(group)}</span>`,
          )
          .join(' ')
      : '<span class="muted">No groups</span>';
  }

  private short(value: string): string {
    return this.escape(value.length > 14 ? `${value.slice(0, 12)}…` : value);
  }

  private date(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Asia/Jakarta',
    }).format(value);
  }
}

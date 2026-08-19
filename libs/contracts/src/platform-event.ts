export type PlatformEventType =
  'SessionRevoked' | 'PasswordChanged' | 'AccessPolicyChanged';

export interface PlatformEventPayload {
  eventId: string;
  deliveryId: string;
  eventType: PlatformEventType;
  userId: string;
  centralSessionId: string | null;
  applicationId: string;
  logoutNotificationUrl: string;
  reason: string;
  occurredAt: string;
  attempt: number;
  metadata: Record<string, unknown>;
}

export interface InternalLogoutRequest {
  eventId: string;
  eventType: PlatformEventType;
  userId: string;
  centralSessionId: string | null;
  applicationId: string;
  reason: string;
  occurredAt: string;
}

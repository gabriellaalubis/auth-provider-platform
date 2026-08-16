export interface ApplicationPolicyResponse {
  groupId: string;
  groupName: string;
}

export interface ApplicationResponse {
  id: string;
  name: string;
  clientId: string;
  status: 'ACTIVE' | 'INACTIVE';
  launchUrl: string | null;
  logoutNotificationUrl: string;
  redirectUris: string[];
  policies: ApplicationPolicyResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatedApplicationResponse extends ApplicationResponse {
  clientSecret: string;
}

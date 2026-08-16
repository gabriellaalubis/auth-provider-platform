export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface UserInfoResponse {
  sub: string;
  name: string;
  email: string;
  groups: string[];
  centralSessionId: string;
}

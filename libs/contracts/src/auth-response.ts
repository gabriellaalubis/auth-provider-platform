import type { UserResponse } from './user-response';

export interface CentralSessionResponse {
  id: string;
  status: 'ACTIVE';
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthResponse {
  user: UserResponse;
  session: CentralSessionResponse;
}

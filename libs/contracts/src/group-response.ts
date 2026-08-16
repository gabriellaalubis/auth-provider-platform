import type { UserResponse } from './user-response';

export interface GroupSummaryResponse {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupDetailResponse extends GroupSummaryResponse {
  members: UserResponse[];
}

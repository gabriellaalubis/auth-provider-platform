export interface UserResponse {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

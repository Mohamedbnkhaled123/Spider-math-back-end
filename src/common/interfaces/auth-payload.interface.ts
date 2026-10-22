import { UserRole } from '../constants/roles.constant';

export interface IJwtPayload {
  sub: string; // User ObjectId as string
  role: UserRole;
  deviceUuid: string;
  studentCode?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: IJwtPayload;
      deviceUuid?: string;
    }
  }
}

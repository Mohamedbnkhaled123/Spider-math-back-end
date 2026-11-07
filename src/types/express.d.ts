import { IJwtPayload } from '../common/interfaces/auth-payload.interface';

declare global {
  namespace Express {
    interface Request {
      user?: IJwtPayload;
      deviceUuid?: string;
    }
  }
}

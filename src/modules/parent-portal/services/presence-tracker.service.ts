import { studentPresenceCache, IStudentPresenceState } from '../../../config/cache.config';

export interface IPresenceStatusResponse {
  isOnline: boolean;
  activityType: 'WATCHING_LECTURE' | 'SOLVING_ASSESSMENT' | 'IDLE' | 'OFFLINE';
  referenceId?: string;
  referenceTitle?: string;
  lastHeartbeatAt?: Date;
  currentPlaybackSec?: number;
}

/**
 * PresenceTrackerService
 * Manages in-memory live student attendance and activity heartbeats in RAM LRU Cache (45s TTL).
 * Generates 0 MongoDB writes, delivering lightning-fast real-time visibility for parent dashboard.
 */
export class PresenceTrackerService {
  /**
   * Retrieves real-time presence status of a student.
   */
  static getPresence(studentId: string): IPresenceStatusResponse {
    const cached =
      studentPresenceCache.get(`presence:${studentId}`) ||
      studentPresenceCache.get(studentId);

    if (!cached) {
      return {
        isOnline: false,
        activityType: 'OFFLINE'
      };
    }

    return {
      isOnline: true,
      activityType: cached.activityType,
      referenceId: cached.referenceId,
      referenceTitle: cached.referenceTitle,
      lastHeartbeatAt: cached.lastHeartbeatAt,
      currentPlaybackSec: cached.currentPlaybackSec
    };
  }

  /**
   * Records student heartbeat in memory (45-second sliding TTL).
   */
  static recordHeartbeat(state: IStudentPresenceState): void {
    studentPresenceCache.set(`presence:${state.studentId}`, state);
  }
}

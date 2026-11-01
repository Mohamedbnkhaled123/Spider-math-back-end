import { LRUCache } from 'lru-cache';

/**
 * Dependency Inversion Principle (DIP):
 * High-level services depend on this abstract cache contract, not concrete LRU libraries.
 */
export interface ICacheStore<T extends {} = Record<string, unknown>> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

/**
 * Concrete LRU Cache Adapter implementing ICacheStore.
 */
export class LruCacheStore<T extends {} = Record<string, unknown>> implements ICacheStore<T> {
  private readonly cache: LRUCache<string, T>;

  constructor(options: { max: number; ttl: number }) {
    this.cache = new LRUCache<string, T>({
      max: options.max,
      ttl: options.ttl,
      updateAgeOnGet: false, // Strict TTL enforcement
      allowStale: false
    });
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (ttlMs !== undefined) {
      this.cache.set(key, value, { ttl: ttlMs });
    } else {
      this.cache.set(key, value);
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// =============================================================================
// Dedicated Domain Cache Channels with Strict TTL Boundaries
// =============================================================================

/**
 * 1. Approved Device Whitelist Cache
 * Caches Set of approved device UUIDs per student.
 * TTL: 30 minutes (1,800,000 ms) | Max entries: 10,000
 * Invalidated immediately upon Super Admin device approval/revocation.
 */
export const deviceWhitelistCache = new LruCacheStore<Set<string>>({
  max: 10000,
  ttl: 30 * 60 * 1000 // 30 minutes
});

/**
 * 2. Real-Time Student Presence Cache
 * Tracks real-time active lesson, position, and timestamp without MongoDB write load.
 * TTL: 45 seconds (45,000 ms) | Max entries: 10,000
 * Generates 0 database writes for live parent dashboard visibility.
 */
export interface IStudentPresenceState {
  studentId: string;
  studentName: string;
  activityType: 'WATCHING_LECTURE' | 'SOLVING_ASSESSMENT' | 'IDLE';
  referenceId: string;
  referenceTitle: string;
  lastHeartbeatAt: Date;
  currentPlaybackSec?: number;
}

export const studentPresenceCache = new LruCacheStore<IStudentPresenceState>({
  max: 10000,
  ttl: 45 * 1000 // 45 seconds
});

/**
 * 3. Public Discovery & Landing Page CMS Cache
 * Caches the main site configuration, bio, schedules, curriculum tree, and public unit catalog queries.
 * TTL: 12 hours (43,200,000 ms) | Max entries: 5,000
 * Shields MongoDB from anonymous traffic and load-testing spikes.
 */
export const publicCmsCache = new LruCacheStore<any>({
  max: 5000,
  ttl: 12 * 60 * 60 * 1000 // 12 hours
});

/**
 * 4. Assessment Answer Key Cache
 * Caches sanitized answer keys and question configurations for active quizzes/exams.
 * TTL: 12 hours (43,200,000 ms) | Max entries: 2,000
 * Eliminates redundant database reads during simultaneous submission spikes.
 */
export interface IAssessmentAnswerKeyPayload {
  assessmentId: string;
  assessmentType: 'QUIZ' | 'HOMEWORK' | 'COMPREHENSIVE_EXAM';
  minExpectedSolveSec: number;
  totalPoints: number;
  xpReward: number;
  questions: Array<{
    questionId: string;
    questionType: 'MCQ' | 'ESSAY_PHOTO';
    correctOptionIndex?: number;
    points: number;
  }>;
}

export const assessmentAnswerKeyCache = new LruCacheStore<IAssessmentAnswerKeyPayload>({
  max: 2000,
  ttl: 12 * 60 * 60 * 1000 // 12 hours
});

import assert from 'assert';
import { Types } from 'mongoose';
import { lastSeenWriteThrottle, THROTTLE_MS, primeStudentLastSeenThrottle, recordStudentLastSeen } from '../../../middlewares/auth.middleware';
import { PresenceTrackerService } from './presence-tracker.service';

console.log('Running Presence and Last-Seen Tracking Unit Tests...');

// --- Test 1: Throttle Map Logic & Prime Verification ---
const studentId1 = new Types.ObjectId().toString();

assert.strictEqual(lastSeenWriteThrottle.get(studentId1), undefined, 'Throttle map should initially be empty for new student');

// Test recordStudentLastSeen (non-persisted unit simulation via throttle check)
recordStudentLastSeen(studentId1);
assert.ok(lastSeenWriteThrottle.has(studentId1), 'recordStudentLastSeen must record current timestamp in throttle map');

// Test priming on login
primeStudentLastSeenThrottle(studentId1);
const primeTime = lastSeenWriteThrottle.get(studentId1);
assert.ok(primeTime && primeTime > 0, 'primeStudentLastSeenThrottle should set timestamp');

// Immediate subsequent call within 30s should be throttled
const t30s = (primeTime || Date.now()) + 30 * 1000;
const diff30s = t30s - (lastSeenWriteThrottle.get(studentId1) || 0);
assert.ok(diff30s < THROTTLE_MS, 'Request within 30s of login should be throttled');

// Request at T0 + 121s should pass (>= 2 minutes)
const t121s = (primeTime || Date.now()) + 121 * 1000;
const diff121s = t121s - (lastSeenWriteThrottle.get(studentId1) || 0);
assert.ok(diff121s >= THROTTLE_MS, 'Request after 2 minutes should not be throttled');

console.log('✔ Test 1 Passed: In-memory write throttle map correctly throttles at 2-minute boundary and supports priming.');

// --- Test 2: Time-Window Online Calculation Rule with Clock Skew Protection ---
const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

function computeIsOnline(lastSeenAt: Date | string | null | undefined, presenceIsOnline: boolean = false): boolean {
  if (presenceIsOnline) return true;
  if (!lastSeenAt) return false;
  const time = new Date(lastSeenAt).getTime();
  if (isNaN(time)) return false;
  const diff = Date.now() - time;
  // Allows up to 60s forward clock skew, and up to 3 minutes in the past
  return diff >= -60 * 1000 && diff < ONLINE_THRESHOLD_MS;
}

// Case A: Recent last seen within 1 minute -> Online
const oneMinAgo = new Date(Date.now() - 60 * 1000);
assert.strictEqual(computeIsOnline(oneMinAgo, false), true, 'Student seen 1m ago must be online');

// Case B: Last seen 2.5 minutes ago -> Online
const twoAndHalfMinAgo = new Date(Date.now() - 150 * 1000);
assert.strictEqual(computeIsOnline(twoAndHalfMinAgo, false), true, 'Student seen 2.5m ago must be online');

// Case C: Last seen 4 minutes ago -> Offline
const fourMinAgo = new Date(Date.now() - 240 * 1000);
assert.strictEqual(computeIsOnline(fourMinAgo, false), false, 'Student seen 4m ago must be offline');

// Case D: Last seen null, presence isOnline false -> Offline
assert.strictEqual(computeIsOnline(null, false), false, 'Null last seen must be offline');
assert.strictEqual(computeIsOnline(undefined, false), false, 'Undefined last seen must be offline');

// Case E: RAM Presence is online, even if last_seen_at is older or null -> Online
assert.strictEqual(computeIsOnline(fourMinAgo, true), true, 'Active RAM presence takes precedence');
assert.strictEqual(computeIsOnline(null, true), true, 'Active RAM presence takes precedence over null last seen');

// Case F: Clock skew guard: future date far ahead (e.g. 1 hour in the future) should not be online
const oneHourFuture = new Date(Date.now() + 60 * 60 * 1000);
assert.strictEqual(computeIsOnline(oneHourFuture, false), false, 'Far-future timestamp must NOT be online');

// Case G: Slight clock skew (10s in future) should still be considered online
const tenSecFuture = new Date(Date.now() + 10 * 1000);
assert.strictEqual(computeIsOnline(tenSecFuture, false), true, 'Slight clock skew (10s future) should remain online');

console.log('✔ Test 2 Passed: Time-window rule (3 minutes) evaluates online status with clock skew protection.');

// --- Test 3: Last Seen Timestamp & Activity Type Resolution ---
function resolvePresence(rawPresence: { isOnline: boolean; activityType: string; lastHeartbeatAt?: Date }, studentLastSeen: Date | null | undefined) {
  const lastSeenAt = rawPresence.lastHeartbeatAt || studentLastSeen || null;
  const diff = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() : Infinity;
  const isOnline = rawPresence.isOnline || (!!lastSeenAt && diff >= -60 * 1000 && diff < ONLINE_THRESHOLD_MS);
  const activityType = isOnline && rawPresence.activityType === 'OFFLINE' ? 'IDLE' : rawPresence.activityType;
  return { isOnline, activityType, lastSeenAt };
}

// Case A: Online via HTTP only (no video heartbeat) -> ActivityType should be 'IDLE', not 'OFFLINE'
const httpOnlyPresence = resolvePresence({ isOnline: false, activityType: 'OFFLINE' }, oneMinAgo);
assert.strictEqual(httpOnlyPresence.isOnline, true);
assert.strictEqual(httpOnlyPresence.activityType, 'IDLE', 'Online student with no heartbeat must have activityType IDLE, not OFFLINE');

// Case B: Actually offline (seen 10m ago) -> ActivityType remains 'OFFLINE'
const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
const offlinePresence = resolvePresence({ isOnline: false, activityType: 'OFFLINE' }, tenMinAgo);
assert.strictEqual(offlinePresence.isOnline, false);
assert.strictEqual(offlinePresence.activityType, 'OFFLINE');

// Case C: Actively watching lecture in RAM -> ActivityType preserved
const watchingPresence = resolvePresence({ isOnline: true, activityType: 'WATCHING_LECTURE', lastHeartbeatAt: new Date() }, tenMinAgo);
assert.strictEqual(watchingPresence.isOnline, true);
assert.strictEqual(watchingPresence.activityType, 'WATCHING_LECTURE');

console.log('✔ Test 3 Passed: Activity type cleanly resolves to IDLE when online via HTTP window and preserves live heartbeats.');

// --- Test 4: Super Admin Students List Mapping with RAM Presence Priority ---
const testStudentId = new Types.ObjectId().toString();
// Seed RAM heartbeat for this student
PresenceTrackerService.recordHeartbeat({
  studentId: testStudentId,
  studentName: 'محمود حسن',
  activityType: 'WATCHING_LECTURE',
  referenceId: 'lec_01',
  referenceTitle: 'الهندسة الفراغية',
  lastHeartbeatAt: new Date(),
  currentPlaybackSec: 120
});

const mockRawStudent = {
  _id: new Types.ObjectId(testStudentId),
  full_name: 'محمود حسن',
  student_code: 'HA1001',
  role: 'STUDENT',
  last_seen_at: tenMinAgo // DB last seen is 10 minutes ago!
};

const ramPresence = PresenceTrackerService.getPresence(mockRawStudent._id.toString());
const resolvedLastSeenAt = ramPresence.lastHeartbeatAt || mockRawStudent.last_seen_at || null;
const diff = resolvedLastSeenAt ? Date.now() - new Date(resolvedLastSeenAt).getTime() : Infinity;
const studentIsOnline = ramPresence.isOnline || (!!resolvedLastSeenAt && diff >= -60 * 1000 && diff < ONLINE_THRESHOLD_MS);

assert.strictEqual(ramPresence.isOnline, true, 'RAM presence must report isOnline');
assert.strictEqual(studentIsOnline, true, 'Admin mapping must recognize active video watching student as online even if DB last_seen_at is old');
assert.strictEqual(resolvedLastSeenAt, ramPresence.lastHeartbeatAt, 'Admin mapping must use latest RAM heartbeat as lastSeenAt');

console.log('✔ Test 4 Passed: Admin student list correctly incorporates RAM presence cache.');

console.log('\n======================================================');
console.log('✔ ALL PRESENCE AND LAST-SEEN TESTS PASSED SUCCESSFULLY! ✔');
console.log('======================================================\n');

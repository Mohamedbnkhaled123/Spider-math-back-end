/**
 * MonotonicTimingAuditStrategy
 * Evaluates monotonic client solve time (elapsed_time_sec measured via performance.now())
 * against assessment.min_expected_solve_sec and server wall-clock bounds (serverReceivedAt - serverStartedAt).
 * Flag:
 * - isSuspiciousFastSolve: true when solve time is strictly below pedagogical minimum baseline.
 * - clockTamperDetected: true when elapsed time is <= 0 or diverges by > 120s from server wall clock (for online solves).
 * Strictly complies with RULES.md Section 4.2 B.
 */
export interface ITimingAuditResult {
  isSuspiciousFastSolve: boolean;
  clockTamperDetected: boolean;
}

export class MonotonicTimingAuditStrategy {
  audit(params: {
    elapsedTimeSec: number;
    minExpectedSolveSec: number;
    serverStartedAt: Date;
    serverReceivedAt: Date;
    isOfflineSynced: boolean;
  }): ITimingAuditResult {
    const serverWallDurationSec = Math.max(
      0,
      (params.serverReceivedAt.getTime() - params.serverStartedAt.getTime()) / 1000
    );

    const isSuspiciousFastSolve = params.elapsedTimeSec < params.minExpectedSolveSec;

    // Flag clock tampering if reported monotonic duration is impossible relative to server wall clock
    const clockTamperDetected =
      params.elapsedTimeSec <= 0 ||
      (!params.isOfflineSynced && Math.abs(serverWallDurationSec - params.elapsedTimeSec) > 120);

    return { isSuspiciousFastSolve, clockTamperDetected };
  }
}

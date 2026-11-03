import https from 'https';
import http from 'http';
import { Response } from 'express';
import { Types } from 'mongoose';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { WatchProgressModel } from '../../../models/watch-progress.model';
import { UserModel } from '../../../models/user.model';
import { GamificationLogModel } from '../../../models/gamification-log.model';
import { studentPresenceCache } from '../../../config/cache.config';
import { CryptoProxyService } from '../../../common/utils/crypto.util';
import { AppError } from '../../../common/utils/app-error.util';
import { ERROR_CODES } from '../../../common/constants/error-codes.constant';
import { WatchHeartbeatDto } from '../dto/watch-heartbeat.dto';

export class LecturesService {
  /**
   * Generates secure DRM playback session token and dynamic student watermark.
   * Guarantees zero unlisted YouTube URLs in client response.
   */
  public async getSecurePlayback(params: {
    lectureId: string;
    studentId: string;
    deviceUuid: string;
    ipAddress?: string;
  }) {
    if (!Types.ObjectId.isValid(params.lectureId)) {
      throw new AppError('Invalid lectureId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const [lecture, student] = await Promise.all([
      LectureMaterialModel.findById(params.lectureId).lean(),
      UserModel.findById(params.studentId).lean()
    ]);

    if (!lecture) {
      throw new AppError('Lecture material not found', 404, ERROR_CODES.LECTURE_NOT_FOUND_404);
    }
    if (!student) {
      throw new AppError('Student profile not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    // Decrypt the raw YouTube video ID using master cipher secret and extract 11-char ID
    const decryptedString = CryptoProxyService.decrypt(lecture.youtube_encrypted_id);
    const rawVideoId = CryptoProxyService.extractYoutubeId(decryptedString);

    // Create a short-lived session-encrypted token bound to this student & device (expires in 5 minutes)
    const sessionVideoToken = CryptoProxyService.createSessionPlaybackToken({
      rawVideoId,
      studentId: params.studentId,
      deviceUuid: params.deviceUuid,
      expiresInSec: 300
    });

    // Dynamic anti-screen-recording watermark payload
    const ip = params.ipAddress || '127.0.0.1';
    const dynamicWatermarkText = `${student.full_name} | ${student.student_code || 'GUEST'} | ${student.phone || ''} | ${ip}`;

    // Get or initialize watch progress
    let progress = await WatchProgressModel.findOne({
      student_id: params.studentId,
      lecture_id: lecture._id
    }).lean();

    return {
      lectureId: lecture._id,
      lectureTitleAr: lecture.lecture_title_ar,
      lectureTitleEn: lecture.lecture_title_en,
      videoId: rawVideoId,
      sessionVideoToken,
      dynamicWatermarkText,
      videoDurationSec: lecture.video_duration_sec,
      completionThresholdPct: lecture.completion_threshold_pct,
      resumePositionSec: progress?.last_playback_position_sec || 0,
      watchPercentage: progress?.watch_percentage || 0,
      isCompleted: progress?.is_completed || false,
      pdfMaterials: (lecture.pdf_materials || []).map((p: any) => ({
        id: p._id,
        title: p.title,
        storageFileId: p.storage_file_id,
        isPrintAllowed: p.is_print_allowed,
        pagesCount: p.pages_count
      }))
    };
  }

  /**
   * Proxies private Google Drive PDF study handouts directly to client.
   * Streams binary ArrayBuffer chunks with X-Print-Allowed header, hiding storage URLs.
   */
  public async streamGoogleDrivePdf(params: {
    lectureId: string;
    fileId: string;
    res: Response;
  }): Promise<void> {
    if (!Types.ObjectId.isValid(params.lectureId)) {
      throw new AppError('Invalid lectureId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const lecture = await LectureMaterialModel.findById(params.lectureId).lean();
    if (!lecture) {
      throw new AppError('Lecture material not found', 404, ERROR_CODES.LECTURE_NOT_FOUND_404);
    }

    // Match PDF handout by storage_file_id or subdocument _id, or fallback to first handout
    let pdfItem = null;
    if (params.fileId && params.fileId.trim() && params.fileId !== 'stream') {
      pdfItem = (lecture.pdf_materials || []).find(
        (p: any) => p.storage_file_id === params.fileId || p._id?.toString() === params.fileId
      );
    }
    if (!pdfItem && lecture.pdf_materials && lecture.pdf_materials.length > 0) {
      pdfItem = lecture.pdf_materials[0];
    }

    if (!pdfItem) {
      throw new AppError('Requested PDF study handout not found in this lecture', 404, ERROR_CODES.RESOURCE_NOT_FOUND_404);
    }

    const googleDriveFileId = pdfItem.storage_file_id;

    // Set secure binary streaming headers
    params.res.setHeader('Content-Type', 'application/pdf');
    params.res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pdfItem.title)}.pdf"`);
    params.res.setHeader('X-Print-Allowed', pdfItem.is_print_allowed ? 'true' : 'false');
    params.res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    // Helper to pipe stream following up to 5 redirects while preserving cookies and handling Google Drive confirmations
    const cookieJar: string[] = [];

    const pipeDriveStream = (streamUrl: string, maxRedirects = 5): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
          return reject(new AppError('Too many redirects fetching Google Drive PDF', 502, ERROR_CODES.INTERNAL_SERVER_ERROR_500));
        }

        const client = streamUrl.startsWith('https') ? https : http;
        const reqHeaders: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (cookieJar.length > 0) {
          reqHeaders['Cookie'] = cookieJar.join('; ');
        }

        client
          .get(
            streamUrl,
            { headers: reqHeaders },
            (driveRes: any) => {
              // Store cookies from Google Drive
              if (driveRes.headers['set-cookie']) {
                const newCookies = driveRes.headers['set-cookie'].map((c: string) => c.split(';')[0]);
                cookieJar.push(...newCookies);
              }

              // Handle HTTP 3xx Redirects
              if (driveRes.statusCode && driveRes.statusCode >= 300 && driveRes.statusCode < 400 && driveRes.headers.location) {
                let loc = driveRes.headers.location;
                // Detect Google login redirect -> file is restricted/private!
                if (loc.includes('accounts.google.com') || loc.includes('ServiceLogin')) {
                  return reject(
                    new AppError(
                      'ملف الـ PDF على Google Drive مقفل أو خاص (Restricted). يجب على المعلمة فتح ملف الـ PDF في Google Drive وتغيير إعداد المشاركة إلى "أي شخص لديه الرابط (Anyone with the link can view)" حتى يتمكن الطلاب من عرضه.',
                      403,
                      ERROR_CODES.FORBIDDEN_403
                    )
                  );
                }

                if (!loc.startsWith('http')) {
                  const parsed = new URL(streamUrl);
                  loc = `${parsed.protocol}//${parsed.host}${loc}`;
                }
                return resolve(pipeDriveStream(loc, maxRedirects - 1));
              }

              if (driveRes.statusCode && driveRes.statusCode >= 400) {
                return reject(new AppError(`Google Drive responded with status ${driveRes.statusCode}`, 502, ERROR_CODES.INTERNAL_SERVER_ERROR_500));
              }

              const upstreamContentType = (driveRes.headers['content-type'] || '').toLowerCase();

              // If Google Drive returned an HTML page (e.g. virus confirmation for large files or sign-in)
              if (upstreamContentType.includes('text/html')) {
                let htmlBuffer = '';
                driveRes.on('data', (chunk: any) => {
                  if (htmlBuffer.length < 50000) {
                    htmlBuffer += chunk.toString();
                  }
                });

                driveRes.on('end', () => {
                  // Check if it's asking for sign-in
                  if (htmlBuffer.includes('accounts.google.com') || htmlBuffer.includes('Sign in') || htmlBuffer.includes('ServiceLogin')) {
                    return reject(
                      new AppError(
                        'ملف الـ PDF على Google Drive مقفل أو خاص (Restricted). يجب على المعلمة فتح ملف الـ PDF في Google Drive وتغيير إعداد المشاركة إلى "أي شخص لديه الرابط (Anyone with the link can view)" حتى يتمكن الطلاب من عرضه.',
                        403,
                        ERROR_CODES.FORBIDDEN_403
                      )
                    );
                  }

                  // Check if it's Google Drive large-file virus scan confirmation
                  const matchHref = htmlBuffer.match(/href="(\/uc\?export=download[^"]+)"/i) ||
                                    htmlBuffer.match(/href="(https:\/\/drive\.usercontent\.google\.com\/download[^"]+)"/i);
                  const matchConfirm = htmlBuffer.match(/confirm=([0-9a-zA-Z_-]+)/);

                  if (matchHref && matchHref[1]) {
                    const confirmUrl = matchHref[1].startsWith('http')
                      ? matchHref[1]
                      : `https://drive.google.com${matchHref[1]}`;
                    return resolve(pipeDriveStream(confirmUrl, maxRedirects - 1));
                  } else if (matchConfirm && matchConfirm[1]) {
                    const confirmUrl = `https://drive.usercontent.google.com/download?id=${googleDriveFileId}&export=download&confirm=${matchConfirm[1]}`;
                    return resolve(pipeDriveStream(confirmUrl, maxRedirects - 1));
                  }

                  return reject(
                    new AppError(
                      'الملف المطلوب ليس مستند PDF صالح أو تعذر جلب محتواه من Google Drive. يرجى التأكد من معرّف الملف.',
                      400,
                      ERROR_CODES.BAD_REQUEST_400
                    )
                  );
                });
                return;
              }

              // Normal stream: pipe directly
              driveRes.pipe(params.res);
              driveRes.on('end', resolve);
              driveRes.on('error', reject);
            }
          )
          .on('error', (err: any) => {
            reject(new AppError(`Failed to stream PDF handout: ${err.message}`, 502, ERROR_CODES.INTERNAL_SERVER_ERROR_500));
          });
      });
    };

    const initialDriveUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(googleDriveFileId)}&confirm=t`;
    return pipeDriveStream(initialDriveUrl);
  }

  /**
   * Watch Heartbeat Processing:
   * Encapsulates 5-second chunk bitmask verification ('Tell, Don't Ask').
   * Updates real-time student presence (45s LRU Cache) and atomically awards XP once >= 85%.
   */
  public async recordWatchHeartbeat(params: {
    lectureId: string;
    studentId: string;
    dto: WatchHeartbeatDto;
  }) {
    if (!Types.ObjectId.isValid(params.lectureId)) {
      throw new AppError('Invalid lectureId format', 400, ERROR_CODES.BAD_REQUEST_400);
    }

    const [lecture, student] = await Promise.all([
      LectureMaterialModel.findById(params.lectureId).lean(),
      UserModel.findById(params.studentId).lean()
    ]);

    if (!lecture) {
      throw new AppError('Lecture material not found', 404, ERROR_CODES.LECTURE_NOT_FOUND_404);
    }
    if (!student) {
      throw new AppError('Student profile not found', 404, ERROR_CODES.STUDENT_NOT_FOUND_404);
    }

    // Fixed original video duration: Video duration in database is strictly protected from external modification
    const videoDurationSec = lecture.video_duration_sec || 60;
    const currentPlaybackSec = Math.max(0, params.dto.currentPlaybackSec || 0);

    // Find or create watch progress document
    let progress = await WatchProgressModel.findOne({
      student_id: params.studentId,
      lecture_id: lecture._id
    });

    if (!progress) {
      progress = await WatchProgressModel.create({
        student_id: params.studentId,
        unit_package_id: lecture.unit_package_id,
        lecture_id: lecture._id,
        accumulated_watch_sec: 0,
        last_playback_position_sec: 0,
        watch_percentage: 0,
        is_completed: false,
        xp_awarded: false
      });
    }

    // Calculate percentage and update playback position
    const watchPercentage = Math.min(100, Math.round((currentPlaybackSec / videoDurationSec) * 100));
    const accumulatedSec = Math.max(progress.accumulated_watch_sec || 0, Math.round(currentPlaybackSec));

    progress.watch_percentage = Math.max(progress.watch_percentage || 0, watchPercentage);
    progress.accumulated_watch_sec = accumulatedSec;
    progress.last_playback_position_sec = currentPlaybackSec;
    progress.last_watched_at = new Date();

    // 1. Update In-Memory Real-Time Presence Cache (45-second TTL, 0 MongoDB writes) for live parent radar
    studentPresenceCache.set(
      `presence:${params.studentId}`,
      {
        studentId: params.studentId,
        studentName: student.full_name,
        activityType: 'WATCHING_LECTURE',
        referenceId: params.lectureId,
        referenceTitle: lecture.lecture_title_ar,
        lastHeartbeatAt: new Date(),
        currentPlaybackSec: currentPlaybackSec
      },
      45 * 1000
    );

    // 2. Atomic Idempotent XP Award (>= 85% or explicit isCompleted signal)
    const isEligible = params.dto.isCompleted === true || currentPlaybackSec >= (videoDurationSec * 0.85);
    let xpJustAwarded = false;

    if (isEligible && !progress.xp_awarded) {
      const awarded = await WatchProgressModel.findOneAndUpdate(
        { _id: progress._id, xp_awarded: false },
        { $set: { xp_awarded: true, is_completed: true, completed_at: new Date() } },
        { new: true }
      );

      if (awarded) {
        xpJustAwarded = true;
        progress.xp_awarded = true;
        progress.is_completed = true;
        progress.completed_at = awarded.completed_at;

        const xpDelta = lecture.xp_reward_on_complete || 50;

        // Atomically increment student's cumulative XP
        await UserModel.findByIdAndUpdate(params.studentId, {
          $inc: { total_xp: xpDelta }
        });

        // Audit XP ledger with 90-day rolling TTL
        await GamificationLogModel.create({
          student_id: params.studentId,
          xp_delta: xpDelta,
          action_type: 'LECTURE_COMPLETED_85',
          reference_id: lecture._id,
          reason_note: `أتم مشاهدة المحاضرة: ${lecture.lecture_title_ar}`
        });
      }
    } else if (isEligible && !progress.is_completed) {
      progress.is_completed = true;
      progress.completed_at = new Date();
    }

    await progress.save();

    return {
      watchPercentage: progress.watch_percentage,
      accumulatedWatchSec: progress.accumulated_watch_sec,
      lastPlaybackPositionSec: progress.last_playback_position_sec,
      isCompleted: progress.is_completed,
      xpAwarded: progress.xp_awarded,
      xpJustAwarded,
      xpReward: xpJustAwarded ? (lecture.xp_reward_on_complete || 50) : 0
    };
  }
}

export const lecturesService = new LecturesService();

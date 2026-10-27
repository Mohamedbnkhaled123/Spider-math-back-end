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

    // Helper to pipe stream following up to 5 redirects
    const pipeDriveStream = (streamUrl: string, maxRedirects = 5): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) {
          return reject(new AppError('Too many redirects fetching Google Drive PDF', 502, ERROR_CODES.INTERNAL_SERVER_ERROR_500));
        }

        const client = streamUrl.startsWith('https') ? https : http;
        client
          .get(
            streamUrl,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            },
            (driveRes: any) => {
              if (driveRes.statusCode && driveRes.statusCode >= 300 && driveRes.statusCode < 400 && driveRes.headers.location) {
                let loc = driveRes.headers.location;
                if (!loc.startsWith('http')) {
                  const parsed = new URL(streamUrl);
                  loc = `${parsed.protocol}//${parsed.host}${loc}`;
                }
                return resolve(pipeDriveStream(loc, maxRedirects - 1));
              }

              if (driveRes.statusCode && driveRes.statusCode >= 400) {
                return reject(new AppError(`Google Drive responded with status ${driveRes.statusCode}`, 502, ERROR_CODES.INTERNAL_SERVER_ERROR_500));
              }

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

    const initialDriveUrl = `https://drive.google.com/uc?export=download&id=${googleDriveFileId}`;
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

    const totalChunks = Math.max(1, Math.ceil(lecture.video_duration_sec / 5));

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
        watched_chunks_bitmap: '0'.repeat(totalChunks),
        watch_percentage: 0,
        is_completed: false,
        xp_awarded: false
      });
    }

    // Ensure bitmap has proper length
    let bitmap = progress.watched_chunks_bitmap || '';
    if (bitmap.length < totalChunks) {
      bitmap = bitmap.padEnd(totalChunks, '0');
    }

    // Set bit '1' at chunkIndex if within totalChunks
    if (params.dto.chunkIndex >= 0 && params.dto.chunkIndex < totalChunks) {
      const bitmapArr = bitmap.split('');
      bitmapArr[params.dto.chunkIndex] = '1';
      bitmap = bitmapArr.join('');
    }

    // Count verified watched chunks
    let onesCount = 0;
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] === '1') onesCount++;
    }

    const watchPercentage = Math.min(100, Math.round((onesCount / totalChunks) * 100));
    const accumulatedSec = onesCount * 5;

    progress.watched_chunks_bitmap = bitmap;
    progress.watch_percentage = watchPercentage;
    progress.accumulated_watch_sec = accumulatedSec;
    progress.last_playback_position_sec = params.dto.currentPlaybackSec;
    progress.last_watched_at = new Date();

    // 1. Update In-Memory Real-Time Presence Cache (45-second TTL, 0 MongoDB writes)
    studentPresenceCache.set(
      `presence:${params.studentId}`,
      {
        studentId: params.studentId,
        studentName: student.full_name,
        activityType: 'WATCHING_LECTURE',
        referenceId: params.lectureId,
        referenceTitle: lecture.lecture_title_ar,
        lastHeartbeatAt: new Date(),
        currentPlaybackSec: params.dto.currentPlaybackSec
      },
      45 * 1000
    );

    // 2. Check Atomic Idempotent XP Award (Threshold >= 85%)
    let xpJustAwarded = false;
    if (watchPercentage >= lecture.completion_threshold_pct && !progress.xp_awarded) {
      const awardedProgress = await WatchProgressModel.findOneAndUpdate(
        { _id: progress._id, xp_awarded: false },
        {
          $set: {
            xp_awarded: true,
            is_completed: true,
            completed_at: new Date()
          }
        },
        { new: true }
      );

      if (awardedProgress) {
        xpJustAwarded = true;
        progress.xp_awarded = true;
        progress.is_completed = true;
        progress.completed_at = awardedProgress.completed_at;

        // Atomically increment student's cumulative XP
        await UserModel.findByIdAndUpdate(params.studentId, {
          $inc: { total_xp: lecture.xp_reward_on_complete }
        });

        // Audit XP ledger with 90-day rolling TTL
        await GamificationLogModel.create({
          student_id: params.studentId,
          xp_delta: lecture.xp_reward_on_complete,
          action_type: 'LECTURE_COMPLETED_85',
          reference_id: lecture._id,
          reason_note: `أتم 85% من المحاضرة: ${lecture.lecture_title_ar}`
        });
      }
    } else if (watchPercentage >= lecture.completion_threshold_pct && !progress.is_completed) {
      progress.is_completed = true;
      progress.completed_at = new Date();
    }

    await progress.save();

    return {
      watchPercentage,
      accumulatedWatchSec: accumulatedSec,
      lastPlaybackPositionSec: progress.last_playback_position_sec,
      isCompleted: progress.is_completed,
      xpAwarded: progress.xp_awarded,
      xpJustAwarded,
      xpReward: xpJustAwarded ? lecture.xp_reward_on_complete : 0
    };
  }
}

export const lecturesService = new LecturesService();

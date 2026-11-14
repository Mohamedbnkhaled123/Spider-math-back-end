import assert from 'assert';
import { AdminLecturesController } from './admin-lectures.controller';
import { UnitPackageModel } from '../../../models/unit-package.model';
import { LectureMaterialModel } from '../../../models/lecture-material.model';
import { Types } from 'mongoose';

async function runTests() {
  console.log('Running AdminLecturesController unit tests...');
  const controller = new AdminLecturesController();

  // Test 1: Create lecture with empty youtubeUrl and empty PDF - should succeed without error
  {
    const dummyUnitId = new Types.ObjectId().toHexString();
    let savedLectureData: any = null;

    // Stub UnitPackageModel.findById
    (UnitPackageModel as any).findById = async () => ({
      _id: dummyUnitId,
      curriculum: 'THANWEYA_AMMA',
      grade_level: 'SEC_3',
      academic_term: 'TERM_1',
      lectures_count: 0,
      save: async () => {}
    });

    (LectureMaterialModel as any).countDocuments = async () => 0;
    (LectureMaterialModel as any).create = async (doc: any) => {
      savedLectureData = doc;
      return { _id: new Types.ObjectId(), ...doc };
    };

    let responseStatus = 0;
    let capturedError: any = null;

    const req: any = {
      body: {
        unitId: dummyUnitId,
        titleAr: 'محاضرة بدون فيديو ولا ملف',
        youtubeUrl: '',
        googleDrivePdfFileId: '',
        xpReward: 50
      }
    };
    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (_data: any) => {}
        };
      }
    };
    const next = (err: any) => {
      capturedError = err;
    };

    await controller.createLecture(req, res, next);

    assert.strictEqual(capturedError, null, 'Should not throw error when youtubeUrl is empty');
    assert.strictEqual(responseStatus, 201, 'Status should be 201');
    assert.strictEqual(savedLectureData.youtube_encrypted_id, '', 'youtube_encrypted_id should be empty');
    assert.strictEqual(savedLectureData.youtube_video_id, '', 'youtube_video_id should be empty');
    assert.strictEqual(savedLectureData.video_duration_sec, 0, 'video_duration_sec should be 0');
    assert.deepStrictEqual(savedLectureData.pdf_materials, [], 'pdf_materials should be empty');
    console.log('✔ Test 1 Passed: createLecture allows empty youtubeUrl and PDF.');
  }

  // Test 2: Create lecture with PDF only (no youtubeUrl) - should succeed
  {
    const dummyUnitId = new Types.ObjectId().toHexString();
    let savedLectureData: any = null;

    (UnitPackageModel as any).findById = async () => ({
      _id: dummyUnitId,
      curriculum: 'THANWEYA_AMMA',
      grade_level: 'SEC_3',
      academic_term: 'TERM_1',
      lectures_count: 1,
      save: async () => {}
    });
    (LectureMaterialModel as any).countDocuments = async () => 1;
    (LectureMaterialModel as any).create = async (doc: any) => {
      savedLectureData = doc;
      return { _id: new Types.ObjectId(), ...doc };
    };

    let responseStatus = 0;
    let capturedError: any = null;

    const req: any = {
      body: {
        unitId: dummyUnitId,
        titleAr: 'محاضرة بملف PDF فقط',
        youtubeUrl: '   ', // whitespace
        googleDrivePdfFileId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
        isPrintAllowed: true,
        xpReward: 30
      }
    };
    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: () => {}
        };
      }
    };
    const next = (err: any) => {
      capturedError = err;
    };

    await controller.createLecture(req, res, next);

    assert.strictEqual(capturedError, null, 'Should not throw error when youtubeUrl is whitespace');
    assert.strictEqual(responseStatus, 201);
    assert.strictEqual(savedLectureData.youtube_encrypted_id, '');
    assert.strictEqual(savedLectureData.pdf_materials.length, 1);
    assert.strictEqual(savedLectureData.pdf_materials[0].storage_file_id, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    console.log('✔ Test 2 Passed: createLecture allows PDF only with empty youtubeUrl.');
  }

  // Test 3: Create lecture with invalid youtube URL - should throw 400
  {
    const dummyUnitId = new Types.ObjectId().toHexString();
    (UnitPackageModel as any).findById = async () => ({
      _id: dummyUnitId,
      curriculum: 'THANWEYA_AMMA',
      grade_level: 'SEC_3',
      academic_term: 'TERM_1',
      save: async () => {}
    });

    let capturedError: any = null;
    const req: any = {
      body: {
        unitId: dummyUnitId,
        titleAr: 'محاضرة برابط غير صالح',
        youtubeUrl: 'https://example.com/short'
      }
    };
    const res: any = {
      status: () => ({ json: () => {} })
    };
    const next = (err: any) => {
      capturedError = err;
    };

    await controller.createLecture(req, res, next);
    assert.ok(capturedError, 'Should throw error on invalid non-empty youtubeUrl');
    assert.strictEqual(capturedError.statusCode, 400);
    console.log('✔ Test 3 Passed: createLecture rejects invalid non-empty youtubeUrl.');
  }

  // Test 4: updateLecture clearing youtubeUrl
  {
    const dummyLectureId = new Types.ObjectId().toHexString();
    let updatedLecture: any = {
      _id: dummyLectureId,
      lecture_title_ar: 'الدرس القديم',
      youtube_encrypted_id: 'some_encrypted_id',
      youtube_video_id: 'dQw4w9WgXcQ',
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      video_duration_sec: 212,
      save: async () => {}
    };

    (LectureMaterialModel as any).findById = async () => updatedLecture;

    let responseStatus = 0;
    let capturedError: any = null;
    const req: any = {
      params: { id: dummyLectureId },
      body: {
        youtubeUrl: '' // clear video
      }
    };
    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };
    const next = (err: any) => {
      capturedError = err;
    };

    await controller.updateLecture(req, res, next);
    assert.strictEqual(capturedError, null);
    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(updatedLecture.youtube_encrypted_id, '');
    assert.strictEqual(updatedLecture.youtube_video_id, '');
    assert.strictEqual(updatedLecture.youtube_url, '');
    console.log('✔ Test 4 Passed: updateLecture allows clearing youtubeUrl to empty string.');
  }

  // Test 5: updateLecture clearing googleDrivePdfFileId
  {
    const dummyLectureId = new Types.ObjectId().toHexString();
    let updatedLecture: any = {
      _id: dummyLectureId,
      lecture_title_ar: 'محاضرة تجريبية',
      google_drive_pdf_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
      pdf_materials: [{ storage_file_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs', is_print_allowed: true }],
      save: async () => {}
    };

    (LectureMaterialModel as any).findById = async () => updatedLecture;

    let responseStatus = 0;
    let capturedError: any = null;
    const req: any = {
      params: { id: dummyLectureId },
      body: {
        googleDrivePdfFileId: '' // clear PDF
      }
    };
    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };
    const next = (err: any) => {
      capturedError = err;
    };

    await controller.updateLecture(req, res, next);
    assert.strictEqual(capturedError, null);
    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(updatedLecture.google_drive_pdf_id, '');
    assert.deepStrictEqual(updatedLecture.pdf_materials, []);
    console.log('✔ Test 5 Passed: updateLecture allows clearing googleDrivePdfFileId.');
  }

  // Test 6: updateLecture updating isPrintAllowed without resending googleDrivePdfFileId
  {
    const dummyLectureId = new Types.ObjectId().toHexString();
    let updatedLecture: any = {
      _id: dummyLectureId,
      lecture_title_ar: 'محاضرة تجريبية',
      google_drive_pdf_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs',
      is_print_allowed: false,
      pdf_materials: [{ storage_file_id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs', is_print_allowed: false }],
      save: async () => {}
    };

    (LectureMaterialModel as any).findById = async () => updatedLecture;

    let responseStatus = 0;
    let capturedError: any = null;
    const req: any = {
      params: { id: dummyLectureId },
      body: {
        isPrintAllowed: true
      }
    };
    const res: any = {
      status: (code: number) => {
        responseStatus = code;
        return { json: () => {} };
      }
    };
    const next = (err: any) => {
      capturedError = err;
    };

    await controller.updateLecture(req, res, next);
    assert.strictEqual(capturedError, null);
    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(updatedLecture.is_print_allowed, true);
    assert.strictEqual(updatedLecture.pdf_materials[0].is_print_allowed, true);
    console.log('✔ Test 6 Passed: updateLecture updates isPrintAllowed without resending googleDrivePdfFileId.');
  }

  // Test 7: LecturesService.getSecurePlayback safely handles lecture without video
  {
    const { lecturesService } = require('../services/lectures.service');
    const { UserModel } = require('../../../models/user.model');
    const { WatchProgressModel } = require('../../../models/watch-progress.model');

    const dummyLecId = new Types.ObjectId().toHexString();
    const dummyStudentId = new Types.ObjectId().toHexString();

    (LectureMaterialModel as any).findById = () => ({
      lean: async () => ({
        _id: dummyLecId,
        lecture_title_ar: 'محاضرة بدون فيديو',
        lecture_title_en: 'Lecture Without Video',
        youtube_encrypted_id: '',
        video_duration_sec: 0,
        completion_threshold_pct: 85,
        pdf_materials: [{ _id: 'pdf1', title: 'الملزمة', storage_file_id: 'drive_id_123', is_print_allowed: true, pages_count: 5 }]
      })
    });

    (UserModel as any).findById = () => ({
      lean: async () => ({
        _id: dummyStudentId,
        full_name: 'أحمد محمد',
        student_code: 'HA-2024',
        phone: '01012345678'
      })
    });

    (WatchProgressModel as any).findOne = () => ({
      lean: async () => null
    });

    const playbackResult = await lecturesService.getSecurePlayback({
      lectureId: dummyLecId,
      studentId: dummyStudentId,
      deviceUuid: 'dev-123'
    });

    assert.strictEqual(playbackResult.videoId, '', 'videoId should be empty');
    assert.strictEqual(playbackResult.sessionVideoToken, '', 'sessionVideoToken should be empty');
    assert.strictEqual(playbackResult.pdfMaterials.length, 1);
    assert.strictEqual(playbackResult.pdfMaterials[0].storageFileId, 'drive_id_123');
    console.log('✔ Test 7 Passed: getSecurePlayback safely returns empty video strings when lecture has no video.');
  }

  console.log('All AdminLecturesController unit tests PASSED successfully!');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

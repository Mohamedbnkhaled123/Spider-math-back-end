import { Request, Response, NextFunction } from 'express';
import { unitsService } from '../services/units.service';
import { createSuccessResponse } from '../../../common/interfaces/api-response.interface';
import { UnitsQueryDto } from '../dto/units-query.dto';
import { ROLES } from '../../../common/constants/roles.constant';

export class UnitsController {
  /**
   * GET /api/v1/units
   * Returns published units hydrated with isSubscribed flag for authenticated students.
   */
  public async getUnitsCatalog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as UnitsQueryDto;
      const studentId = req.user?.sub;
      const units = await unitsService.getUnitsCatalog(query, studentId);
      res.status(200).json(createSuccessResponse(units, { totalCount: units.length }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/units/:unitId/curriculum-contents
   * Returns ordered lectures and assessments inside a UnitPackage.
   */
  public async getUnitCurriculumContents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const unitId = req.params.unitId!;
      const studentId = req.user?.sub;
      const isSuperAdmin = req.user?.role === ROLES.SUPER_ADMIN;
      const contents = await unitsService.getUnitCurriculumContents(unitId, studentId, isSuperAdmin);
      res.status(200).json(createSuccessResponse(contents));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/admin/units
   */
  public async createUnitPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const unit = await unitsService.createUnitPackage(req.body);
      res.status(201).json(createSuccessResponse(unit));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/admin/units/:id
   */
  public async updateUnitPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const unitId = req.params.id!;
      const updated = await unitsService.updateUnitPackage(unitId, req.body);
      res.status(200).json(createSuccessResponse(updated));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/admin/units/:id
   */
  public async deleteUnitPackage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const unitId = req.params.id!;
      const result = await unitsService.deleteUnitPackage(unitId);
      res.status(200).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  }
}

export const unitsController = new UnitsController();

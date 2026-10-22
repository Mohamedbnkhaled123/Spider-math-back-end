import { Router } from 'express';
import { unitsController } from './controllers/units.controller';
import { optionalAuthenticateJwt, authenticateJwt } from '../../middlewares/auth.middleware';
import { requireRoles } from '../../middlewares/role.middleware';
import { validateRequest, validateBody } from '../../middlewares/validate.middleware';
import { ROLES } from '../../common/constants/roles.constant';
import { unitsQueryDtoSchema } from './dto/units-query.dto';
import { createUnitPackageDtoSchema, updateUnitPackageDtoSchema } from './dto/unit-crud.dto';

export const unitsRouter = Router();
export const adminUnitsRouter = Router();

// =============================================================================
// Public / Student Catalog Endpoints (/api/v1/units)
// =============================================================================

/**
 * GET /api/v1/units?curriculum=EGYPTIAN&gradeLevel=SEC_3&term=TERM_1&type=STUDY_UNIT
 * Catalog listing hydrated with isSubscribed if user is logged in.
 */
unitsRouter.get(
  '/',
  optionalAuthenticateJwt,
  validateRequest({ query: unitsQueryDtoSchema }),
  unitsController.getUnitsCatalog
);

/**
 * GET /api/v1/units/:unitId/curriculum-contents
 * Ordered lectures and assessments inside a UnitPackage.
 */
unitsRouter.get(
  '/:unitId/curriculum-contents',
  optionalAuthenticateJwt,
  unitsController.getUnitCurriculumContents
);

// =============================================================================
// Super Admin Unit Management Endpoints (/api/v1/admin/units)
// =============================================================================

adminUnitsRouter.use(authenticateJwt, requireRoles(ROLES.SUPER_ADMIN));

adminUnitsRouter.post(
  '/',
  validateBody(createUnitPackageDtoSchema),
  unitsController.createUnitPackage
);

adminUnitsRouter.patch(
  '/:id',
  validateBody(updateUnitPackageDtoSchema),
  unitsController.updateUnitPackage
);

adminUnitsRouter.delete('/:id', unitsController.deleteUnitPackage);

import { Router } from 'express';
import { testimonialsController } from './testimonials.controller';
import { authenticateJwt } from '../../middlewares/auth.middleware';
import { authorizeRoles } from '../../middlewares/role.middleware';
import { ROLES } from '../../common/constants/roles.constant';

export const publicTestimonialsRouter = Router();
export const adminTestimonialsRouter = Router();

// Public: View approved testimonials
publicTestimonialsRouter.get('/', testimonialsController.getApprovedTestimonials);

// Authenticated: Registered students or parents only submit their testimonial
publicTestimonialsRouter.post(
  '/',
  authenticateJwt,
  authorizeRoles(ROLES.STUDENT, ROLES.PARENT),
  testimonialsController.submitTestimonial
);

// Admin: Manage testimonials
adminTestimonialsRouter.get(
  '/',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  testimonialsController.getAllTestimonialsAdmin
);

adminTestimonialsRouter.patch(
  '/:id',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  testimonialsController.updateTestimonialAdmin
);

adminTestimonialsRouter.delete(
  '/:id',
  authenticateJwt,
  authorizeRoles(ROLES.SUPER_ADMIN),
  testimonialsController.deleteTestimonialAdmin
);

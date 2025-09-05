import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Admin validation rules
export const validateAdminCreate = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be between 1-50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be between 1-50 characters'),
  body('role')
    .isIn(['superadmin', 'admin', 'support', 'billing', 'moderator', 'product', 'marketing', 'developer', 'sales', 'legal', 'aiops'])
    .withMessage('Valid role is required'),
  body('level')
    .isInt({ min: 1, max: 5 })
    .withMessage('Level must be between 1-5'),
  body('team')
    .isIn(['executive', 'support', 'billing', 'product', 'marketing', 'development', 'sales', 'legal', 'aiops'])
    .withMessage('Valid team is required'),
  body('permissions')
    .isArray()
    .withMessage('Permissions must be an array'),
  handleValidationErrors
];

export const validateAdminUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Valid admin ID is required'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1-50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1-50 characters'),
  body('role')
    .optional()
    .isIn(['superadmin', 'admin', 'support', 'billing', 'moderator', 'product', 'marketing', 'developer', 'sales', 'legal', 'aiops'])
    .withMessage('Valid role is required'),
  body('level')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Level must be between 1-5'),
  body('team')
    .optional()
    .isIn(['executive', 'support', 'billing', 'product', 'marketing', 'development', 'sales', 'legal', 'aiops'])
    .withMessage('Valid team is required'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array'),
  handleValidationErrors
];

export const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

export const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),
  handleValidationErrors
];

// User validation rules
export const validateUserUpdate = [
  param('id')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1-50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1-50 characters'),
  body('phone')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]+$/)
    .withMessage('Valid phone number is required'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('isBanned')
    .optional()
    .isBoolean()
    .withMessage('isBanned must be a boolean'),
  body('banReason')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Ban reason must be less than 500 characters'),
  handleValidationErrors
];

// Refund validation rules
export const validateRefundCreate = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('reason')
    .notEmpty()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason is required and must be between 10-500 characters'),
  body('refundMethod')
    .isIn(['original', 'wallet', 'bank_transfer'])
    .withMessage('Valid refund method is required'),
  handleValidationErrors
];

// Coupon validation rules
export const validateCouponCreate = [
  body('code')
    .isLength({ min: 3, max: 20 })
    .matches(/^[A-Z0-9_-]+$/)
    .withMessage('Code must be 3-20 characters and contain only uppercase letters, numbers, hyphens, and underscores'),
  body('type')
    .isIn(['flat', 'percentage'])
    .withMessage('Type must be either flat or percentage'),
  body('value')
    .isFloat({ min: 0 })
    .withMessage('Value must be a positive number'),
  body('maxUses')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max uses must be a positive integer'),
  body('expiresAt')
    .optional()
    .isISO8601()
    .withMessage('Expiry date must be a valid ISO 8601 date'),
  body('scope')
    .isIn(['all', 'subscription', 'credits', 'addons'])
    .withMessage('Valid scope is required'),
  handleValidationErrors
];

// Ticket validation rules
export const validateTicketCreate = [
  body('subject')
    .notEmpty()
    .isLength({ min: 5, max: 200 })
    .withMessage('Subject is required and must be between 5-200 characters'),
  body('description')
    .notEmpty()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Description is required and must be between 10-2000 characters'),
  body('priority')
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Valid priority is required'),
  body('category')
    .isIn(['billing', 'technical', 'general', 'refund', 'feature_request', 'bug_report'])
    .withMessage('Valid category is required'),
  handleValidationErrors
];

// Pagination validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),
  query('sortBy')
    .optional()
    .isString()
    .withMessage('Sort by must be a string'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
  handleValidationErrors
];

// Search validation
export const validateSearch = [
  query('q')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1-100 characters'),
  query('filters')
    .optional()
    .isJSON()
    .withMessage('Filters must be valid JSON'),
  handleValidationErrors
];

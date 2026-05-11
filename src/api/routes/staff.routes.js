'use strict';

const express = require('express');
const { registerStaff, loginStaff, listStaff, goOffline, deleteStaff, updateStaffRole } = require('../controllers/staff.controller');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { requireOwnerOrAdmin } = require('../middlewares/roleMiddleware');
const { checkPlanLimit } = require('../services/planLimitService');

const router = express.Router();

// Public: Staff login (cần shop_id)
router.post('/login', loginStaff);

// Protected routes
router.use(authMiddleware);
// Bug 8 fix: thêm requireOwnerOrAdmin + checkPlanLimit cho register
router.post('/register', requireOwnerOrAdmin, checkPlanLimit('staff'), registerStaff);
router.get('/', listStaff);
router.post('/offline', goOffline);
router.delete('/:id', requireOwnerOrAdmin, deleteStaff);
router.patch('/:id/role', requireOwnerOrAdmin, updateStaffRole);

module.exports = router;

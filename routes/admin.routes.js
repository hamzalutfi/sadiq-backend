const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  addUser,
  updateUser,
  deleteUser,
  suspendUser,
  activateUser,
  getAllOrders,
  updateOrderStatus,
  processRefund,
  getDashboardStats,
  generateSalesReport,
} = require("../controllers/admin.controller");
const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../config/constants");

// All admin routes require authentication and admin role
router.use(protect, authorize(ROLES.ADMIN));

// User management routes
router.get("/users", getAllUsers);
router.post("/users", addUser);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);
router.put("/users/:id/suspend", suspendUser);
router.put("/users/:id/activate", activateUser);

// Order management routes
router.get("/orders", getAllOrders);
router.put("/orders/:id/status", updateOrderStatus);
router.post("/orders/:id/refund", processRefund);

// Dashboard and reports routes
router.get("/dashboard", getDashboardStats);
router.get("/reports/sales", generateSalesReport);

module.exports = router;

const express = require("express");
const router = express.Router();
const {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  updatePassword,
  verifyEmail,
} = require("../controllers/auth.controller");
const { protect } = require("../middleware/auth.middleware");
const {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validatePasswordUpdate,
} = require("../validators/auth.validator");

router.post("/register", validateRegister, register);
router.post("/login", validateLogin, login);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotPassword);
router.put("/reset-password/:resettoken", validatePasswordReset, resetPassword);
router.put("/update-password", protect, validatePasswordUpdate, updatePassword);

module.exports = router;

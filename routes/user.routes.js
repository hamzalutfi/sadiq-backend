const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
  updateEmail,
  deleteAccount,
  uploadProfileImage,
} = require("../controllers/user.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect); // All routes require authentication

router.route("/profile").get(getProfile).put(updateProfile);

router.put("/email", updateEmail);
router.delete("/account", deleteAccount);
router.put("/profile-image", uploadProfileImage);

module.exports = router;

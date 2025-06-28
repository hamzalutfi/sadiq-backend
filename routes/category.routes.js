const express = require("express");
const router = express.Router();
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} = require("../controllers/category.controller");
const { protect, authorize } = require("../middleware/auth.middleware");
const { ROLES } = require("../config/constants");

router
  .route("/")
  .get(getCategories)
  .post(protect, authorize(ROLES.ADMIN), createCategory);

router
  .route("/:id")
  .get(getCategory)
  .put(protect, authorize(ROLES.ADMIN), updateCategory)
  .delete(protect, authorize(ROLES.ADMIN), deleteCategory);

module.exports = router;

const Category = require("../models/category");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse } = require("../utils/api_response");

// @desc    Get all categories
// @route   GET /api/v1/categories
// @access  Public
exports.getCategories = asyncHandler(async (req, res, next) => {
  const categories = await Category.find({ isActive: true })
    .populate("parent", "name slug")
    .sort("displayOrder name");

  // Build hierarchy
  const categoriesMap = {};
  const rootCategories = [];

  categories.forEach((cat) => {
    categoriesMap[cat._id] = { ...cat.toObject(), subcategories: [] };
  });

  categories.forEach((cat) => {
    if (cat.parent) {
      const parent = categoriesMap[cat.parent._id];
      if (parent) {
        parent.subcategories.push(categoriesMap[cat._id]);
      }
    } else {
      rootCategories.push(categoriesMap[cat._id]);
    }
  });

  ApiResponse.success(res, rootCategories);
});

// @desc    Get single category
// @route   GET /api/v1/categories/:id
// @access  Public
exports.getCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id)
    .populate("parent", "name slug")
    .populate("subcategories");

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  ApiResponse.success(res, category);
});

// @desc    Create category
// @route   POST /api/v1/categories
// @access  Private/Admin
exports.createCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.create(req.body);
  ApiResponse.success(res, category, "Category created successfully", 201);
});

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private/Admin
exports.updateCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  ApiResponse.success(res, category, "Category updated successfully");
});

// @desc    Delete category
// @route   DELETE /api/v1/categories/:id
// @access  Private/Admin
exports.deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  // Check if category has products
  const Product = require("../models/product");
  const productCount = await Product.countDocuments({
    category: req.params.id,
  });

  if (productCount > 0) {
    return next(new ErrorResponse("Cannot delete category with products", 400));
  }

  // Check if category has subcategories
  const subcategoryCount = await Category.countDocuments({
    parent: req.params.id,
  });

  if (subcategoryCount > 0) {
    return next(
      new ErrorResponse("Cannot delete category with subcategories", 400)
    );
  }

  await category.remove();

  ApiResponse.success(res, null, "Category deleted successfully");
});

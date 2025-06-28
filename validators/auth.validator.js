const { body, validationResult } = require("express-validator");

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

// Register validation
exports.validateRegister = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Full name must be between 2 and 100 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
    // .matches(/^(?=.*[A-Za-z])(?=.*\\d)/)
    // .withMessage("Password must contain at least one letter and one number"),
  body("phoneNumber")
    .optional()
    .isMobilePhone()
    .withMessage("Please provide a valid phone number"),
  validate,
];

// Login validation
exports.validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  validate,
];

// Password reset validation
exports.validatePasswordReset = [
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .matches(/^(?=.*[A-Za-z])(?=.*\\d)/)
    .withMessage("Password must contain at least one letter and one number"),
  validate,
];

// Password update validation
exports.validatePasswordUpdate = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .matches(/^(?=.*[A-Za-z])(?=.*\\d)/)
    .withMessage("Password must contain at least one letter and one number")
    .custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage("New password must be different from current password"),
  validate,
];

const Product = require("../models/product");
const Category = require("../models/category");
const Review = require("../models/review");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse, getPaginationData } = require("../utils/api_response");

// @desc    Get all products
// @route   GET /api/v1/products
// @access  Public
exports.getProducts = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build query

  let query = { isActive: true };

  // Search functionality
  if (req.query.search) {
    query.$text = { $search: req.query.search };
  }

  // Filter by category
  if (req.query.category) {
    const category = await Category.findOne({ slug: req.query.category });
    if (category) {
      const subcategories = await category.getAllSubcategories();
      const categoryIds = [
        category._id,
        ...subcategories.map((sub) => sub._id),
      ];
      query.category = { $in: categoryIds };
    }
  }

  // Filter by price range
  if (req.query.minPrice || req.query.maxPrice) {
    query.price = {};
    if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
    if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
  }

  // Filter by product type
  if (req.query.type) {
    query.productType = req.query.type;
  }

  // Filter by rating
  if (req.query.minRating) {
    query["ratings.average"] = { $gte: parseFloat(req.query.minRating) };
  }

  // Sort options
  let sortBy = "-createdAt"; // Default: newest first
  if (req.query.sort) {
    switch (req.query.sort) {
      case "price-low":
        sortBy = "price";
        break;
      case "price-high":
        sortBy = "-price";
        break;
      case "rating":
        sortBy = "-ratings.average";
        break;
      case "popular":
        sortBy = "-metadata.purchases";
        break;
    }
  }

  // Execute query
  const products = await Product.find(query)
    .populate("category", "name slug")
    .sort(sortBy)
    .limit(limit)
    .skip(skip);

  // Get total count
  const total = await Product.countDocuments(query);

  // Increment view count for products
  await Product.updateMany(
    { _id: { $in: products.map((p) => p._id) } },
    { $inc: { "metadata.views": 1 } }
  );

  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, products, pagination);
});

// @desc    Get single product
// @route   GET /api/v1/products/:id
// @access  Public
exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id)
    .populate("category", "name slug")
    .populate("reviews");

  if (!product) {
    return next(new ErrorResponse("Product not found", 404));
  }

  // Increment view count
  product.metadata.views += 1;
  await product.save();

  ApiResponse.success(res, product);
});

// @desc    Create product
// @route   POST /api/v1/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.createdBy = req.user.id;

  // Verify category exists
  const category = await Category.findById(req.body.category);
  if (!category) {
    return next(new ErrorResponse("Invalid category", 400));
  }

  const product = await Product.create(req.body);

  // Update category product count
  category.metadata.productCount += 1;
  await category.save();

  ApiResponse.success(res, product, "Product created successfully", 201);
});

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res, next) => {
  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse("Product not found", 404));
  }

  // If category is being changed, update counts
  if (req.body.category && req.body.category !== product.category.toString()) {
    // Decrease old category count
    await Category.findByIdAndUpdate(product.category, {
      $inc: { "metadata.productCount": -1 },
    });

    // Increase new category count
    await Category.findByIdAndUpdate(req.body.category, {
      $inc: { "metadata.productCount": 1 },
    });
  }

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  ApiResponse.success(res, product, "Product updated successfully");
});

// @desc    Delete product
// @route   DELETE /api/v1/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse("Product not found", 404));
  }

  // Soft delete
  product.isActive = false;
  await product.save();

  // Update category count
  await Category.findByIdAndUpdate(product.category, {
    $inc: { "metadata.productCount": -1 },
  });

  ApiResponse.success(res, null, "Product deleted successfully");
});

// @desc    Get products by category
// @route   GET /api/v1/products/category/:categorySlug
// @access  Public
exports.getProductsByCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findOne({ slug: req.params.categorySlug });

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Get all subcategories
  const subcategories = await category.getAllSubcategories();
  const categoryIds = [category._id, ...subcategories.map((sub) => sub._id)];

  const products = await Product.find({
    category: { $in: categoryIds },
    isActive: true,
  })
    .populate("category", "name slug")
    .sort("-createdAt")
    .limit(limit)
    .skip(skip);

  const total = await Product.countDocuments({
    category: { $in: categoryIds },
    isActive: true,
  });

  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(
    res,
    {
      category,
      products,
    },
    pagination
  );
});

// @desc    Add product review
// @route   POST /api/v1/products/:id/reviews
// @access  Private
exports.addReview = asyncHandler(async (req, res, next) => {
  const { rating, title, comment } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) {
    return next(new ErrorResponse("Product not found", 404));
  }

  // Check if user has purchased this product
  const Order = require("../models/order");
  const order = await Order.findOne({
    user: req.user.id,
    "items.product": req.params.id,
    status: "completed",
  });

  if (!order) {
    return next(
      new ErrorResponse("You must purchase this product to review it", 400)
    );
  }

  // Check if already reviewed
  const existingReview = await Review.findOne({
    product: req.params.id,
    user: req.user.id,
    order: order._id,
  });

  if (existingReview) {
    return next(
      new ErrorResponse("You have already reviewed this product", 400)
    );
  }

  const review = await Review.create({
    product: req.params.id,
    user: req.user.id,
    order: order._id,
    rating,
    title,
    comment,
  });

  ApiResponse.success(res, review, "Review added successfully", 201);
});

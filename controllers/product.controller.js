const Product = require('../models/product');
const Category = require('../models/category');
const Review = require('../models/review');
const { ErrorResponse, asyncHandler } = require('../utils/errorHandler');
const { ApiResponse, getPaginationData } = require('../utils/api_response');
const path = require('path');

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
      const categoryIds = [category._id, ...subcategories.map(sub => sub._id)];
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
    query['ratings.average'] = { $gte: parseFloat(req.query.minRating) };
  }

  // Filter by brand
  if (req.query.brand) {
    query['metadata.brand'] = new RegExp(req.query.brand, 'i');
  }

  // Filter by tags
  if (req.query.tags) {
    const tags = req.query.tags.split(',');
    query['metadata.tags'] = { $in: tags };
  }

  // Filter by featured
  if (req.query.featured) {
    query.isFeatured = req.query.featured === 'true';
  }

  // Sort options
  let sortBy = '-createdAt'; // Default: newest first
  if (req.query.sort) {
    switch (req.query.sort) {
      case 'price-low':
        sortBy = 'price';
        break;
      case 'price-high':
        sortBy = '-price';
        break;
      case 'rating':
        sortBy = '-ratings.average';
        break;
      case 'popular':
        sortBy = '-metadata.purchases';
        break;
      case 'views':
        sortBy = '-metadata.views';
        break;
      case 'name-asc':
        sortBy = 'name';
        break;
      case 'name-desc':
        sortBy = '-name';
        break;
    }
  }

  // Execute query
  const products = await Product.find(query)
    .populate('category', 'name slug')
    .sort(sortBy)
    .limit(limit)
    .skip(skip)
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl'); // Hide sensitive data

  // Get total count
  const total = await Product.countDocuments(query);

  // Increment view count for products (bulk update)
  if (products.length > 0) {
    await Product.updateMany(
      { _id: { $in: products.map(p => p._id) } },
      { $inc: { 'metadata.views': 1 } }
    );
  }

  const pagination = getPaginationData(page, limit, total);

  // Get price range for filters
  const priceRange = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    }
  ]);

  ApiResponse.paginated(res, {
    products,
    filters: {
      priceRange: priceRange[0] || { minPrice: 0, maxPrice: 0 }
    }
  }, pagination);
});

// @desc    Get single product
// @route   GET /api/v1/products/:id
// @access  Public
exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id)
    .populate('category', 'name slug parent')
    .populate({
      path: 'reviews',
      populate: {
        path: 'user',
        select: 'fullName profileImage'
      }
    })
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  if (!product.isActive && (!req.user || req.user.role !== 'admin')) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Increment view count
  product.metadata.views += 1;
  await product.save();

  // Get related products
  const relatedProducts = await Product.find({
    category: product.category._id,
    _id: { $ne: product._id },
    isActive: true
  })
    .limit(4)
    .select('name price discountPrice images ratings slug');

  ApiResponse.success(res, {
    product,
    relatedProducts
  });
});

// @desc    Get product by slug
// @route   GET /api/v1/products/slug/:slug
// @access  Public
exports.getProductBySlug = asyncHandler(async (req, res, next) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('category', 'name slug parent')
    .populate({
      path: 'reviews',
      populate: {
        path: 'user',
        select: 'fullName profileImage'
      }
    })
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  if (!product.isActive && (!req.user || req.user.role !== 'admin')) {
    return next(new ErrorResponse('Product not found', 404));
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
  req.body.createdBy = req.user._id;

  // Handle uploaded images
  if (req.files && req.files.length > 0) {
    const images = req.files.map((file, index) => ({
      url: file.path.replace('public', ''),
      alt: req.body.name || 'Product image',
      isPrimary: index === 0 // First image is primary
    }));
    req.body.images = images;
  } else {
    req.body.images = [];
  }

  // Handle category - if it's a string (name), find or create the category
  let category;
  if (typeof req.body.category === 'string') {
    // Try to find existing category by name
    category = await Category.findOne({
      name: { $regex: new RegExp(`^${req.body.category}$`, 'i') }
    });

    // If category doesn't exist, create it
    if (!category) {
      category = await Category.create({
        name: req.body.category,
        description: `Category for ${req.body.category}`,
        slug: 'test',
        isActive: true
      });
    }

    req.body.category = category._id;
  } else {
    // If it's already an ID, verify the category exists
    category = await Category.findById(req.body.category);
    if (!category) {
      return next(new ErrorResponse('Invalid category', 400));
    }
  }

  // Set default product type if not provided
  if (!req.body.productType) {
    req.body.productType = 'digital_key';
  }

  // Generate unique slug using the model's static method
  req.body.slug = await Product.generateUniqueSlug(req.body.name);

  // Generate SKU if not provided
  if (!req.body.metadata?.sku) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    req.body.metadata = {
      ...req.body.metadata,
      sku: `SKU-${timestamp}-${random}`.toUpperCase()
    };
  }

  const product = await Product.create(req.body);

  // Update category product count
  category.metadata.productCount += 1;
  await category.save();

  ApiResponse.success(res, product, 'Product created successfully', 201);
});

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res, next) => {
  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // If category is being changed, update counts
  if (req.body.category && req.body.category !== product.category.toString()) {
    // Verify new category exists
    const newCategory = await Category.findById(req.body.category);
    if (!newCategory) {
      return next(new ErrorResponse('Invalid category', 400));
    }

    // Decrease old category count
    await Category.findByIdAndUpdate(product.category, {
      $inc: { 'metadata.productCount': -1 }
    });

    // Increase new category count
    newCategory.metadata.productCount += 1;
    await newCategory.save();
  }

  // Don't allow updating certain fields
  delete req.body.createdBy;
  delete req.body.metadata?.views;
  delete req.body.metadata?.purchases;
  delete req.body.ratings;

  product = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  ApiResponse.success(res, product, 'Product updated successfully');
});

// @desc    Delete product
// @route   DELETE /api/v1/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Check if product has pending orders
  const Order = require('../models/order');
  const pendingOrders = await Order.countDocuments({
    'items.product': product._id,
    status: { $in: ['pending', 'processing'] }
  });

  if (pendingOrders > 0) {
    return next(new ErrorResponse('Cannot delete product with pending orders', 400));
  }

  // Soft delete
  product.isActive = false;
  await product.save();

  // Update category count
  await Category.findByIdAndUpdate(product.category, {
    $inc: { 'metadata.productCount': -1 }
  });

  ApiResponse.success(res, null, 'Product deleted successfully');
});

// @desc    Get products by category
// @route   GET /api/v1/products/category/:categorySlug
// @access  Public
exports.getProductsByCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findOne({ slug: req.params.categorySlug });

  if (!category) {
    return next(new ErrorResponse('Category not found', 404));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Get all subcategories
  const subcategories = await category.getAllSubcategories();
  const categoryIds = [category._id, ...subcategories.map(sub => sub._id)];

  // Build query
  let query = {
    category: { $in: categoryIds },
    isActive: true
  };

  // Apply additional filters from query params
  if (req.query.minPrice || req.query.maxPrice) {
    query.price = {};
    if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
    if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
  }

  if (req.query.minRating) {
    query['ratings.average'] = { $gte: parseFloat(req.query.minRating) };
  }

  // Sort
  let sortBy = '-createdAt';
  if (req.query.sort) {
    switch (req.query.sort) {
      case 'price-low':
        sortBy = 'price';
        break;
      case 'price-high':
        sortBy = '-price';
        break;
      case 'rating':
        sortBy = '-ratings.average';
        break;
      case 'popular':
        sortBy = '-metadata.purchases';
        break;
    }
  }

  const products = await Product.find(query)
    .populate('category', 'name slug')
    .sort(sortBy)
    .limit(limit)
    .skip(skip)
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  const total = await Product.countDocuments(query);
  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, {
    category: {
      _id: category._id,
      name: category.name,
      slug: category.slug,
      description: category.description
    },
    products
  }, pagination);
});

// @desc    Get featured products
// @route   GET /api/v1/products/featured
// @access  Public
exports.getFeaturedProducts = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 8;

  const products = await Product.find({
    isActive: true,
    isFeatured: true
  })
    .populate('category', 'name slug')
    .sort('-updatedAt')
    .limit(limit)
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  ApiResponse.success(res, products);
});

// @desc    Get top selling products
// @route   GET /api/v1/products/top-selling
// @access  Public
exports.getTopSellingProducts = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;

  const products = await Product.find({
    isActive: true,
    'metadata.purchases': { $gt: 0 }
  })
    .populate('category', 'name slug')
    .sort('-metadata.purchases')
    .limit(limit)
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  ApiResponse.success(res, products);
});

// @desc    Get new arrivals
// @route   GET /api/v1/products/new-arrivals
// @access  Public
exports.getNewArrivals = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const daysAgo = parseInt(req.query.days, 10) || 30;

  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysAgo);

  const products = await Product.find({
    isActive: true,
    createdAt: { $gte: dateThreshold }
  })
    .populate('category', 'name slug')
    .sort('-createdAt')
    .limit(limit)
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  ApiResponse.success(res, products);
});

// @desc    Get products on sale
// @route   GET /api/v1/products/on-sale
// @access  Public
exports.getProductsOnSale = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const products = await Product.find({
    isActive: true,
    discountPrice: { $exists: true, $ne: null },
    $expr: { $lt: ['$discountPrice', '$price'] }
  })
    .populate('category', 'name slug')
    .sort('-updatedAt')
    .limit(limit)
    .skip(skip)
    .select('-digitalContent.licenseKey -digitalContent.downloadUrl');

  const total = await Product.countDocuments({
    isActive: true,
    discountPrice: { $exists: true, $ne: null },
    $expr: { $lt: ['$discountPrice', '$price'] }
  });

  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, products, pagination);
});

// @desc    Add product review
// @route   POST /api/v1/products/:id/reviews
// @access  Private
exports.addReview = asyncHandler(async (req, res, next) => {
  const { rating, title, comment } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Check if user has purchased this product
  const Order = require('../models/order');
  const order = await Order.findOne({
    user: req.user._id,
    'items.product': req.params.id,
    status: 'completed'
  });

  if (!order) {
    return next(new ErrorResponse('You must purchase this product to review it', 400));
  }

  // Check if already reviewed
  const existingReview = await Review.findOne({
    product: req.params.id,
    user: req.user._id,
    order: order._id
  });

  if (existingReview) {
    return next(new ErrorResponse('You have already reviewed this product', 400));
  }

  const review = await Review.create({
    product: req.params.id,
    user: req.user._id,
    order: order._id,
    rating,
    title,
    comment
  });

  // Populate user info for response
  await review.populate('user', 'fullName profileImage');

  ApiResponse.success(res, review, 'Review added successfully', 201);
});

// @desc    Update product review
// @route   PUT /api/v1/products/:id/reviews/:reviewId
// @access  Private
exports.updateReview = asyncHandler(async (req, res, next) => {
  const { rating, title, comment } = req.body;

  let review = await Review.findById(req.params.reviewId);

  if (!review) {
    return next(new ErrorResponse('Review not found', 404));
  }

  // Check ownership
  if (review.user.toString() !== req.user._id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update this review', 403));
  }

  // Save edit history
  review.editHistory.push({
    editedAt: new Date(),
    previousRating: review.rating,
    previousComment: review.comment
  });

  review.rating = rating || review.rating;
  review.title = title || review.title;
  review.comment = comment || review.comment;
  review.isEdited = true;

  await review.save();

  // Update product ratings
  await Review.getAverageRating(review.product);

  ApiResponse.success(res, review, 'Review updated successfully');
});

// @desc    Delete product review
// @route   DELETE /api/v1/products/:id/reviews/:reviewId
// @access  Private
exports.deleteReview = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.reviewId);

  if (!review) {
    return next(new ErrorResponse('Review not found', 404));
  }

  // Check ownership
  if (review.user.toString() !== req.user._id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this review', 403));
  }

  await review.remove();

  ApiResponse.success(res, null, 'Review deleted successfully');
});

// @desc    Get product reviews
// @route   GET /api/v1/products/:id/reviews
// @access  Public
exports.getProductReviews = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  let query = { product: req.params.id };

  // Filter by rating
  if (req.query.rating) {
    query.rating = parseInt(req.query.rating);
  }

  // Sort options
  let sortBy = '-createdAt';
  if (req.query.sort === 'helpful') {
    sortBy = '-helpful.count';
  } else if (req.query.sort === 'rating-high') {
    sortBy = '-rating';
  } else if (req.query.sort === 'rating-low') {
    sortBy = 'rating';
  }

  const reviews = await Review.find(query)
    .populate('user', 'fullName profileImage')
    .sort(sortBy)
    .limit(limit)
    .skip(skip);

  const total = await Review.countDocuments(query);
  const pagination = getPaginationData(page, limit, total);

  // Get rating distribution
  const ratingDistribution = await Review.aggregate([
    { $match: { product: req.params.id } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: -1 } }
  ]);

  ApiResponse.paginated(res, {
    reviews,
    ratingDistribution
  }, pagination);
});

// @desc    Mark review as helpful
// @route   PUT /api/v1/products/:id/reviews/:reviewId/helpful
// @access  Private
exports.markReviewHelpful = asyncHandler(async (req, res, next) => {
  const review = await Review.findById(req.params.reviewId);

  if (!review) {
    return next(new ErrorResponse('Review not found', 404));
  }

  // Check if already marked as helpful
  if (review.helpful.users.includes(req.user._id)) {
    return next(new ErrorResponse('You have already marked this review as helpful', 400));
  }

  review.helpful.users.push(req.user._id);
  review.helpful.count += 1;
  await review.save();

  ApiResponse.success(res, review, 'Review marked as helpful');
});

// @desc    Upload product images
// @route   POST /api/v1/products/:id/images
// @access  Private/Admin
exports.uploadProductImages = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  if (!req.files || !req.files.images) {
    return next(new ErrorResponse('Please upload images', 400));
  }

  const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images];

  if (images.length > 5) {
    return next(new ErrorResponse('Maximum 5 images allowed', 400));
  }

  const uploadedImages = [];

  for (const image of images) {
    // Check file type
    if (!image.mimetype.startsWith('image')) {
      return next(new ErrorResponse('Please upload image files only', 400));
    }

    // Check file size
    if (image.size > process.env.MAX_FILE_UPLOAD) {
      return next(new ErrorResponse(
        `Please upload images less than ${process.env.MAX_FILE_UPLOAD / 1000000}MB`,
        400
      ));
    }

    // Create custom filename
    const fileName = `product_${product._id}_${Date.now()}${path.parse(image.name).ext}`;

    // Move file to upload directory
    await image.mv(`${process.env.FILE_UPLOAD_PATH}/${fileName}`);

    uploadedImages.push({
      url: `/uploads/${fileName}`,
      alt: req.body.alt || product.name,
      isPrimary: product.images.length === 0 && uploadedImages.length === 0
    });
  }

  product.images.push(...uploadedImages);
  await product.save();

  ApiResponse.success(res, product.images, 'Images uploaded successfully');
});

// @desc    Delete product image
// @route   DELETE /api/v1/products/:id/images/:imageId
// @access  Private/Admin
exports.deleteProductImage = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  const imageIndex = product.images.findIndex(
    img => img._id.toString() === req.params.imageId
  );

  if (imageIndex === -1) {
    return next(new ErrorResponse('Image not found', 404));
  }

  // If deleting primary image, make the next one primary
  if (product.images[imageIndex].isPrimary && product.images.length > 1) {
    const nextIndex = imageIndex === 0 ? 1 : 0;
    product.images[nextIndex].isPrimary = true;
  }

  product.images.splice(imageIndex, 1);
  await product.save();

  ApiResponse.success(res, null, 'Image deleted successfully');
});

// @desc    Set primary product image
// @route   PUT /api/v1/products/:id/images/:imageId/primary
// @access  Private/Admin
exports.setPrimaryImage = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Reset all images to non-primary
  product.images.forEach(img => {
    img.isPrimary = false;
  });

  // Set selected image as primary
  const image = product.images.find(
    img => img._id.toString() === req.params.imageId
  );

  if (!image) {
    return next(new ErrorResponse('Image not found', 404));
  }

  image.isPrimary = true;
  await product.save();

  ApiResponse.success(res, product.images, 'Primary image updated');
});
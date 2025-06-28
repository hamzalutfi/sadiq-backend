const User = require("../models/user");
const Product = require("../models/product");
const Order = require("../models/order");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse, getPaginationData } = require("../utils/api_response");
const { exportToCSV, exportToExcel } = require("../utils/export.utils");

// @desc    Get all users (admin)
// @route   GET /api/v1/admin/users
// @access  Private/Admin
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  let query = {};

  // Search by name or email
  if (req.query.search) {
    query.$or = [
      { fullName: new RegExp(req.query.search, "i") },
      { email: new RegExp(req.query.search, "i") },
    ];
  }

  // Filter by role
  if (req.query.role) {
    query.role = req.query.role;
  }

  // Filter by status
  if (req.query.isActive !== undefined) {
    query.isActive = req.query.isActive === "true";
  }

  const users = await User.find(query)
    .sort("-createdAt")
    .limit(limit)
    .skip(skip);

  const total = await User.countDocuments(query);
  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, users, pagination);
});

// @desc    Update user (admin)
// @route   PUT /api/v1/admin/users/:id
// @access  Private/Admin
exports.updateUser = asyncHandler(async (req, res, next) => {
  const allowedUpdates = ["role", "isActive", "isEmailVerified"];
  const updates = {};

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  ApiResponse.success(res, user, "User updated successfully");
});

// @desc    Add user (admin)
// @route   POST /api/v1/admin/users
// @access  Private/Admin
exports.addUser = asyncHandler(async (req, res, next) => {
  const { fullName, email, password, phoneNumber, role = "user" } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse("User with this email already exists", 400));
  }

  // Create new user
  const user = await User.create({
    fullName,
    email,
    password,
    phoneNumber,
    role,
    isEmailVerified: true, // Admin created users are verified by default
  });

  // Remove password from response
  user.password = undefined;

  ApiResponse.success(res, user, "User created successfully", 201);
});

// @desc    Delete user (admin)
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Admin
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // Prevent admin from deleting themselves
  if (user._id.toString() === req.user._id.toString()) {
    return next(new ErrorResponse("Cannot delete your own account", 400));
  }

  // Check if user has active orders
  const activeOrders = await Order.findOne({ user: user._id, status: { $in: ["pending", "processing"] } });
  if (activeOrders) {
    return next(new ErrorResponse("Cannot delete user with active orders", 400));
  }

  await User.findByIdAndDelete(req.params.id);

  ApiResponse.success(res, null, "User deleted successfully");
});

// @desc    Suspend user (admin)
// @route   PUT /api/v1/admin/users/:id/suspend
// @access  Private/Admin
exports.suspendUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // Prevent admin from suspending themselves
  if (user._id.toString() === req.user._id.toString()) {
    return next(new ErrorResponse("Cannot suspend your own account", 400));
  }

  user.isSuspended = true;
  user.isActive = false;
  await user.save();

  // Remove password from response
  user.password = undefined;

  ApiResponse.success(res, user, "User suspended successfully");
});

// @desc    Activate user (admin)
// @route   PUT /api/v1/admin/users/:id/activate
// @access  Private/Admin
exports.activateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  user.isSuspended = false;
  user.isActive = true;
  await user.save();

  // Remove password from response
  user.password = undefined;

  ApiResponse.success(res, user, "User activated successfully");
});

// @desc    Get all orders (admin)
// @route   GET /api/v1/admin/orders
// @access  Private/Admin
exports.getAllOrders = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  let query = {};

  // Filter by status
  if (req.query.status) {
    query.status = req.query.status;
  }

  // Filter by date range
  if (req.query.startDate || req.query.endDate) {
    query.createdAt = {};
    if (req.query.startDate) {
      query.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      query.createdAt.$lte = new Date(req.query.endDate);
    }
  }

  // Search by order number
  if (req.query.orderNumber) {
    query.orderNumber = new RegExp(req.query.orderNumber, "i");
  }

  const orders = await Order.find(query)
    .populate("user", "fullName email")
    .populate("items.product", "name")
    .sort("-createdAt")
    .limit(limit)
    .skip(skip);

  const total = await Order.countDocuments(query);
  const pagination = getPaginationData(page, limit, total);

  ApiResponse.paginated(res, orders, pagination);
});

// @desc    Update order status (admin)
// @route   PUT /api/v1/admin/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { status, note } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse("Order not found", 404));
  }

  order.status = status;
  order.statusHistory.push({
    status,
    note,
    updatedBy: req.user._id,
  });

  // Handle specific status updates
  if (status === "completed") {
    order.paymentDetails.paidAt = new Date();
  }

  await order.save();

  // Send status update email to customer
  // ... implement email notification

  ApiResponse.success(res, order, "Order status updated successfully");
});

// @desc    Process refund (admin)
// @route   POST /api/v1/admin/orders/:id/refund
// @access  Private/Admin
exports.processRefund = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;

  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse("Order not found", 404));
  }

  if (!order.refund.requested) {
    return next(new ErrorResponse("No refund requested for this order", 400));
  }

  await order.processRefund(
    amount || order.pricing.total,
    order.refund.reason,
    req.user._id
  );

  // Process actual refund through payment gateway
  // ... implement payment gateway refund

  ApiResponse.success(res, order, "Refund processed successfully");
});

// @desc    Get dashboard statistics (admin)
// @route   GET /api/v1/admin/dashboard
// @access  Private/Admin
exports.getDashboardStats = asyncHandler(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  // Get statistics
  const [
    totalUsers,
    newUsersToday,
    totalProducts,
    totalOrders,
    ordersToday,
    revenueToday,
    revenueThisMonth,
    revenueLastMonth,
    pendingOrders,
    topProducts,
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ createdAt: { $gte: today } }),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.aggregate([
      { $match: { createdAt: { $gte: today }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$pricing.total" } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: thisMonth }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$pricing.total" } } },
    ]),
    Order.aggregate([
      {
        $match: {
          createdAt: { $gte: lastMonth, $lt: thisMonth },
          status: "completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$pricing.total" } } },
    ]),
    Order.countDocuments({ status: "pending" }),
    Product.find({ isActive: true })
      .sort("-metadata.purchases")
      .limit(5)
      .select("name metadata.purchases price"),
  ]);

  const stats = {
    users: {
      total: totalUsers,
      newToday: newUsersToday,
    },
    products: {
      total: totalProducts,
    },
    orders: {
      total: totalOrders,
      today: ordersToday,
      pending: pendingOrders,
    },
    revenue: {
      today: revenueToday[0]?.total || 0,
      thisMonth: revenueThisMonth[0]?.total || 0,
      lastMonth: revenueLastMonth[0]?.total || 0,
      growth: revenueLastMonth[0]?.total
        ? (
          ((revenueThisMonth[0]?.total - revenueLastMonth[0]?.total) /
            revenueLastMonth[0]?.total) *
          100
        ).toFixed(2)
        : 100,
    },
    topProducts,
  };

  ApiResponse.success(res, stats);
});

// @desc    Generate sales report (admin)
// @route   GET /api/v1/admin/reports/sales
// @access  Private/Admin
exports.generateSalesReport = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, format = "json" } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse("Please provide start and end dates", 400));
  }

  const orders = await Order.find({
    createdAt: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
    status: "completed",
  })
    .populate("user", "fullName email")
    .populate("items.product", "name");

  const reportData = orders.map((order) => ({
    orderNumber: order.orderNumber,
    date: order.createdAt,
    customer: order.user.fullName,
    email: order.user.email,
    items: order.items.length,
    subtotal: order.pricing.subtotal,
    tax: order.pricing.tax,
    shipping: order.pricing.shipping,
    discount: order.pricing.discount,
    total: order.pricing.total,
    paymentMethod: order.paymentMethod,
    status: order.status,
  }));

  if (format === "csv") {
    const csvData = await exportToCSV(reportData);
    res.header("Content-Type", "text/csv");
    res.attachment(`sales-report-${startDate}-to-${endDate}.csv`);
    return res.send(csvData);
  }

  if (format === "excel") {
    const excelBuffer = await exportToExcel(reportData);
    res.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.attachment(`sales-report-${startDate}-to-${endDate}.xlsx`);
    return res.send(excelBuffer);
  }

  ApiResponse.success(res, reportData);
});

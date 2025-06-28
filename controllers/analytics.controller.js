const Order = require("../models/order");
const Product = require("../models/product");
const User = require("../models/user");
const { asyncHandler } = require("../utils/errorHandler");
const { ApiResponse } = require("../utils/api_response");

// @desc    Get revenue analytics
// @route   GET /api/v1/analytics/revenue
// @access  Private/Admin
exports.getRevenueAnalytics = asyncHandler(async (req, res, next) => {
  const { period = "month", year = new Date().getFullYear() } = req.query;

  let groupBy;
  let dateFormat;

  switch (period) {
    case "day":
      groupBy = { $dayOfMonth: "$createdAt" };
      dateFormat = "%Y-%m-%d";
      break;
    case "week":
      groupBy = { $week: "$createdAt" };
      dateFormat = "%Y-W%V";
      break;
    case "month":
      groupBy = { $month: "$createdAt" };
      dateFormat = "%Y-%m";
      break;
    case "year":
      groupBy = { $year: "$createdAt" };
      dateFormat = "%Y";
      break;
  }

  const revenue = await Order.aggregate([
    {
      $match: {
        status: "completed",
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $group: {
        _id: groupBy,
        revenue: { $sum: "$pricing.total" },
        orders: { $sum: 1 },
        avgOrderValue: { $avg: "$pricing.total" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  ApiResponse.success(res, revenue);
});

// @desc    Get product analytics
// @route   GET /api/v1/analytics/products
// @access  Private/Admin
exports.getProductAnalytics = asyncHandler(async (req, res, next) => {
  const { limit = 10 } = req.query;

  const [
    topSellingProducts,
    topViewedProducts,
    topRatedProducts,
    categoryDistribution,
  ] = await Promise.all([
    // Top selling products
    Product.find({ isActive: true })
      .sort("-metadata.purchases")
      .limit(parseInt(limit))
      .select("name metadata.purchases price category"),

    // Top viewed products
    Product.find({ isActive: true })
      .sort("-metadata.views")
      .limit(parseInt(limit))
      .select("name metadata.views"),

    // Top rated products
    Product.find({ isActive: true, "ratings.count": { $gte: 5 } })
      .sort("-ratings.average")
      .limit(parseInt(limit))
      .select("name ratings"),

    // Category distribution
    Order.aggregate([
      { $match: { status: "completed" } },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category.name",
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          quantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
  ]);

  ApiResponse.success(res, {
    topSellingProducts,
    topViewedProducts,
    topRatedProducts,
    categoryDistribution,
  });
});

// @desc    Get customer analytics
// @route   GET /api/v1/analytics/customers
// @access  Private/Admin
exports.getCustomerAnalytics = asyncHandler(async (req, res, next) => {
  const [
    customerGrowth,
    customerRetention,
    topCustomers,
    customerLifetimeValue,
  ] = await Promise.all([
    // Customer growth by month
    User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          newCustomers: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]),

    // Customer retention (users with multiple orders)
    Order.aggregate([
      { $group: { _id: "$user", orderCount: { $sum: 1 } } },
      { $match: { orderCount: { $gt: 1 } } },
      { $count: "returningCustomers" },
    ]),

    // Top customers by revenue
    Order.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: "$user",
          totalSpent: { $sum: "$pricing.total" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          fullName: "$user.fullName",
          email: "$user.email",
          totalSpent: 1,
          orderCount: 1,
        },
      },
    ]),

    // Average customer lifetime value
    Order.aggregate([
      { $match: { status: "completed" } },
      {
        $group: {
          _id: "$user",
          lifetimeValue: { $sum: "$pricing.total" },
        },
      },
      {
        $group: {
          _id: null,
          avgLifetimeValue: { $avg: "$lifetimeValue" },
        },
      },
    ]),
  ]);

  const totalCustomers = await User.countDocuments();
  const returningCustomers = customerRetention[0]?.returningCustomers || 0;
  const retentionRate =
    totalCustomers > 0
      ? ((returningCustomers / totalCustomers) * 100).toFixed(2)
      : 0;

  ApiResponse.success(res, {
    customerGrowth,
    retentionRate: `${retentionRate}%`,
    topCustomers,
    avgCustomerLifetimeValue: customerLifetimeValue[0]?.avgLifetimeValue || 0,
  });
});

// @desc    Get conversion analytics
// @route   GET /api/v1/analytics/conversion
// @access  Private/Admin
exports.getConversionAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  const [cartAbandonment, conversionFunnel] = await Promise.all([
    // Cart abandonment rate
    Cart.aggregate([
      {
        $match: {
          "items.0": { $exists: true },
          updatedAt: dateFilter,
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "user",
          foreignField: "user",
          as: "orders",
        },
      },
      {
        $project: {
          hasOrder: { $gt: [{ $size: "$orders" }, 0] },
        },
      },
      {
        $group: {
          _id: null,
          totalCarts: { $sum: 1 },
          abandonedCarts: {
            $sum: { $cond: ["$hasOrder", 0, 1] },
          },
        },
      },
    ]),

    // Conversion funnel
    Promise.all([
      Product.aggregate([
        { $group: { _id: null, totalViews: { $sum: "$metadata.views" } } },
      ]),
      Cart.countDocuments({ "items.0": { $exists: true } }),
      Order.countDocuments(),
      Order.countDocuments({ status: "completed" }),
    ]),
  ]);

  const abandonmentRate = cartAbandonment[0]
    ? (
        (cartAbandonment[0].abandonedCarts / cartAbandonment[0].totalCarts) *
        100
      ).toFixed(2)
    : 0;

  const funnel = {
    productViews: conversionFunnel[0][0]?.totalViews || 0,
    cartsCreated: conversionFunnel[1],
    ordersPlaced: conversionFunnel[2],
    ordersCompleted: conversionFunnel[3],
  };

  ApiResponse.success(res, {
    cartAbandonmentRate: `${abandonmentRate}%`,
    conversionFunnel: funnel,
    conversionRates: {
      viewToCart:
        funnel.productViews > 0
          ? ((funnel.cartsCreated / funnel.productViews) * 100).toFixed(2) + "%"
          : "0%",
      cartToOrder:
        funnel.cartsCreated > 0
          ? ((funnel.ordersPlaced / funnel.cartsCreated) * 100).toFixed(2) + "%"
          : "0%",
      orderCompletion:
        funnel.ordersPlaced > 0
          ? ((funnel.ordersCompleted / funnel.ordersPlaced) * 100).toFixed(2) +
            "%"
          : "0%",
    },
  });
});

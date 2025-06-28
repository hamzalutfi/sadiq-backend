// Standardized API response format
class ApiResponse {
  static success(res, data = null, message = "Success", statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(res, message = "Error", statusCode = 400, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }

  static paginated(res, data, pagination, message = "Success") {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination,
    });
  }
}

// Pagination helper
const getPaginationData = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    total,
    currentPage: page,
    totalPages,
    limit,
    hasNextPage,
    hasPrevPage,
  };
};

module.exports = { ApiResponse, getPaginationData };

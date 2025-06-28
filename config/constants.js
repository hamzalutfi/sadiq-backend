module.exports = {
  // User roles
  ROLES: {
    USER: "user",
    ADMIN: "admin",
    SUPER_ADMIN: "super_admin",
  },

  // Order status
  ORDER_STATUS: {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    REFUNDED: "refunded",
  },

  // Payment methods
  PAYMENT_METHODS: {
    WHATSAPP: "whatsapp",
    TRANSFER: "transfer",
    CREDIT_CARD: "credit_card",
    DEBIT_CARD: "debit_card",
    PAYPAL: "paypal",
    STRIPE: "stripe",
    CASH_ON_DELIVERY: "cod",
  },

  // Product types
  PRODUCT_TYPES: {
    DIGITAL_KEY: "digital_key",
    SUBSCRIPTION: "subscription",
    VOUCHER: "voucher",
    SOFTWARE: "software",
    OTHER: "other",
  },

  // Offer types
  OFFER_TYPES: {
    PERCENTAGE: "percentage",
    FIXED_AMOUNT: "fixed_amount",
    BUY_ONE_GET_ONE: "bogo",
    FREE_SHIPPING: "free_shipping",
  },

  // HTTP Status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER: 500,
  },
};

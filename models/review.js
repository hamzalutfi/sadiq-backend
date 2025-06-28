const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.ObjectId,
      ref: "Product",
      required: [true, "Review must belong to a product"],
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Review must belong to a user"],
    },
    order: {
      type: mongoose.Schema.ObjectId,
      ref: "Order",
      required: [true, "Review must be associated with a verified purchase"],
    },
    rating: {
      type: Number,
      required: [true, "Please provide a rating"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot be more than 5"],
    },
    title: {
      type: String,
      trim: true,
      maxLength: [100, "Review title cannot exceed 100 characters"],
    },
    comment: {
      type: String,
      required: [true, "Please provide a review comment"],
      maxLength: [1000, "Review cannot exceed 1000 characters"],
    },
    images: [
      {
        url: String,
        caption: String,
      },
    ],
    helpful: {
      count: {
        type: Number,
        default: 0,
      },
      users: [
        {
          type: mongoose.Schema.ObjectId,
          ref: "User",
        },
      ],
    },
    verified: {
      type: Boolean,
      default: true,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editHistory: [
      {
        editedAt: Date,
        previousRating: Number,
        previousComment: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate reviews
ReviewSchema.index({ product: 1, user: 1, order: 1 }, { unique: true });

// Static method to calculate average rating
ReviewSchema.statics.getAverageRating = async function (productId) {
  const result = await this.aggregate([
    {
      $match: { product: productId },
    },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  try {
    await this.model("Product").findByIdAndUpdate(productId, {
      "ratings.average": result[0]?.averageRating || 0,
      "ratings.count": result[0]?.totalReviews || 0,
    });
  } catch (err) {
    console.error(err);
  }
};

// Update product rating after save
ReviewSchema.post("save", async function () {
  await this.constructor.getAverageRating(this.product);
});

// Update product rating after remove
ReviewSchema.post("remove", async function () {
  await this.constructor.getAverageRating(this.product);
});

module.exports = mongoose.model("Review", ReviewSchema);

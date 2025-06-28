const User = require("../models/user");
const { ErrorResponse, asyncHandler } = require("../utils/errorHandler");
const { ApiResponse } = require("../utils/api_response");
const path = require("path");

// @desc    Get user profile
// @route   GET /api/v1/users/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id);
  ApiResponse.success(res, user);
});

// @desc    Update user profile
// @route   PUT /api/v1/users/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    fullName: req.body.fullName,
    phoneNumber: req.body.phoneNumber,
    address: req.body.address,
    preferences: req.body.preferences,
  };

  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(
    (key) => fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  const user = await User.findByIdAndUpdate(req.user._id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  });

  ApiResponse.success(res, user, "Profile updated successfully");
});

// @desc    Update email
// @route   PUT /api/v1/users/email
// @access  Private
exports.updateEmail = asyncHandler(async (req, res, next) => {
  const { newEmail, password } = req.body;

  const user = await User.findById(req.user._id).select("+password");

  // Verify password
  if (!(await user.matchPassword(password))) {
    return next(new ErrorResponse("Password is incorrect", 401));
  }

  // Check if email already exists
  const emailExists = await User.findOne({ email: newEmail });
  if (emailExists) {
    return next(new ErrorResponse("Email already in use", 400));
  }

  user.email = newEmail;
  user.isEmailVerified = false;
  await user.save();

  // Send verification email for new email
  // ... (similar to registration)

  ApiResponse.success(
    res,
    user,
    "Email updated. Please verify your new email."
  );
});

// @desc    Delete user account
// @route   DELETE /api/v1/users/account
// @access  Private
exports.deleteAccount = asyncHandler(async (req, res, next) => {
  const { password } = req.body;

  const user = await User.findById(req.user._id).select("+password");

  // Verify password
  if (!(await user.matchPassword(password))) {
    return next(new ErrorResponse("Password is incorrect", 401));
  }

  // Soft delete - deactivate account
  user.isActive = false;
  await user.save();

  res.cookie("token", "none", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  ApiResponse.success(res, null, "Account deactivated successfully");
});

// @desc    Upload profile image
// @route   PUT /api/v1/users/profile-image
// @access  Private
exports.uploadProfileImage = asyncHandler(async (req, res, next) => {
  if (!req.files || !req.files.image) {
    return next(new ErrorResponse("Please upload an image", 400));
  }

  const file = req.files.image;

  // Check file type
  if (!file.mimetype.startsWith("image")) {
    return next(new ErrorResponse("Please upload an image file", 400));
  }

  // Check file size
  if (file.size > process.env.MAX_FILE_UPLOAD) {
    return next(
      new ErrorResponse(
        `Please upload an image less than ${
          process.env.MAX_FILE_UPLOAD / 1000000
        }MB`,
        400
      )
    );
  }

  // Create custom filename
  file.name = `photo_${req.user._id}_${Date.now()}${path.parse(file.name).ext}`;

  // Move file to upload directory
  file.mv(`${process.env.FILE_UPLOAD_PATH}${file.name}`, async (err) => {
    if (err) {
      console.error(err);
      return next(new ErrorResponse("Problem with file upload", 500));
    }

    await User.findByIdAndUpdate(req.user._id, { profileImage: file.name });

    ApiResponse.success(
      res,
      { profileImage: file.name },
      "Profile image uploaded"
    );
  });
});

const jwt = require("jsonwebtoken");

// Get token from model, create cookie and send response
exports.sendTokenResponse = (user, statusCode, res, message = "Success") => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  res
    .status(statusCode)
    .cookie("token", token, options)
    .json({
      success: true,
      message,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
};

// Verify JWT token
exports.verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

// Generate JWT token
exports.generateToken = (payload, expiresIn = process.env.JWT_EXPIRE) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

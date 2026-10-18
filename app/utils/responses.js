const Responses = {
  success: {
    statusCode: 200,
    message: "success",
    clientMessage: { Message: "Success" },
  },
  created: {
    statusCode: 201,
    message: "created",
    clientMessage: { Message: "Created" },
  },
  emailExists: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Email already exists" },
  },
  alreadyExist: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Already exists" },
  },
  badRequest: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Bad Request" },
  },
  unauthorized: {
    statusCode: 401,
    message: "unauthorized",
    clientMessage: { Message: "Unauthorized" },
  },
  paymentRequired: {
    statusCode: 402,
    message: "payment required",
    clientMessage: { Message: "Payment Required" },
  },
  notFound: {
    statusCode: 404,
    message: "not found",
    clientMessage: { Message: 'Data not found' },
  },
  userNotFound: {
    statusCode: 404,
    message: "User not found",
    clientMessage: { Message: "User not found" },
  },
  serverTimeout: {
    statusCode: 408,
    message: "server timeout",
    clientMessage: { Message: "Server Timeout" },
  },
  requestEntryLarge: {
    statusCode: 413,
    message: "request entry too large",
    clientMessage: { Message: "Request entry too large" },
  },
  requestURLToLong: {
    statusCode: 414,
    message: "request-URL too long",
    clientMessage: { Message: "Request-URL too long" },
  },
  unsupportedMedia: {
    statusCode: 415,
    message: "unsupported media type",
    clientMessage: { Message: "Unsupported media type" },
  },
  expectationFailed: {
    statusCode: 417,
    message: "expectation failed",
    clientMessage: { Message: "Expectation failed" },
  },
  serverError: {
    statusCode: 500,
    message: "internal server error",
    clientMessage: { Message: "Internal server error" },
  },
  unavailable: {
    statusCode: 503,
    message: "service unavailable",
    clientMessage: { Message: "Service unavailable" },
  },
  validEmail: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Please enter valid email" },
  },
  validUserName: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Please enter valid UserName" },
  },
  validPassword: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Please enter valid password" },
  },
  tryAgain: {
    statusCode: 400,
    message: "bad request",
    clientMessage: { Message: "Something went wrong, Please try again later" },
  }
};

module.exports = { Responses };

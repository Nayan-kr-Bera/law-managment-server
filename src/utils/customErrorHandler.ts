class CustomErrorHandler extends Error {
	status: number;

	constructor(status: number, msg: string) {
		super();
		this.status = status;
		this.message = msg;
		Error.captureStackTrace(this, this.constructor);
	}

	static alreadyExist(message: string) {
		return new CustomErrorHandler(409, message);
	}

	static wrongCredentials(
		message: string = "Your email & password is wrong"
	) {
		return new CustomErrorHandler(401, message);
	}

	static unAuthorized(
		message: string = "Unauthorised User"
	) {
		return new CustomErrorHandler(401, message);
	}

	static notFound(
		message: string = "404 Not Found"
	) {
		return new CustomErrorHandler(404, message);
	}

	static pleseGiveCorrectData(
		message: string = "Please give Correct Input Data"
	) {
		return new CustomErrorHandler(400, message);
	}

	static serverError(
		message: string = "Internal Server Error"
	) {
		return new CustomErrorHandler(500, message);
	}

	static badRequest(
		message: string = "Bad Request"
	) {
		return new CustomErrorHandler(400, message);
	}

	// ----------------- New Handlers -----------------

	static forbidden(
		message: string = "Access Forbidden"
	) {
		return new CustomErrorHandler(403, message);
	}

	static conflict(
		message: string = "Conflict"
	) {
		return new CustomErrorHandler(409, message);
	}

	static unprocessableEntity(
		message: string = "Unprocessable Entity"
	) {
		return new CustomErrorHandler(422, message);
	}

	static tooManyRequests(
		message: string = "Too Many Requests"
	) {
		return new CustomErrorHandler(429, message);
	}

	static serviceUnavailable(
		message: string = "Service Unavailable"
	) {
		return new CustomErrorHandler(503, message);
	}

	static notImplemented(
		message: string = "Not Implemented"
	) {
		return new CustomErrorHandler(501, message);
	}
}

export default CustomErrorHandler;
import { Request, Response, NextFunction } from "express";
import { Container } from "typedi";
import { UsersService } from "../../services/users.service";
import { AccessTokenPayload } from "../../dtos/token.response.dto";
import { ACCESS_TOKEN_SECRET } from "../config/config";
import jwt, { JsonWebTokenError } from "jsonwebtoken";
import { HttpException } from "../exceptions/httpException";
import { BUSINESS_LOGIC_ERRORS } from "../const/errorCodes";

const getAuthorizationToken = (req: Request): string | null => {
	const authorizationHeader = req.headers.authorization;
	if (!authorizationHeader) return null;

	const token = authorizationHeader.split(" ")[1];
	return token;
};

const userService: UsersService = Container.get(UsersService);

export const AuthMiddleware = (
	rolesWhitelist: string[] = [],
	strict = false,
	onlyFresh = false
): ((req: Request, res: Response, next: NextFunction) => void) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		const token = getAuthorizationToken(req);
		if (!token && strict) {
			res.status(401).json({
				statusCode: 401,
				message: "Unauthorized",
			});
			return;
		}

		if (!token) {
			res.locals.isAnonymous = true;
			next();
			return;
		}

		res.locals.isAnonymous = false;
		let decoded: AccessTokenPayload;
		try {
			decoded = jwt.verify(
				token,
				ACCESS_TOKEN_SECRET
			) as AccessTokenPayload;
		} catch (e) {
			if (e instanceof JsonWebTokenError) {
				throw new HttpException(
					401,
					BUSINESS_LOGIC_ERRORS,
					"invalid token",
					[
						{
							field: "authorization",
							message: [e.message],
						},
					]
				);
			}

			throw e;
		}

		if (decoded.category !== "access") {
			throw new HttpException(
				401,
				BUSINESS_LOGIC_ERRORS,
				"invalid token",
				[
					{
						field: "authorization",
						message: ["token is not access token"],
					},
				]
			);
		}

		if (onlyFresh && !decoded.isFresh) {
			throw new HttpException(
				401,
				BUSINESS_LOGIC_ERRORS,
				"need fresh token, please login again"
			);
		}

		try {
			const user = await userService.validateAccessToken(decoded);
			if (
				rolesWhitelist.length != 0 &&
				!rolesWhitelist.includes(user.role)
			) {
				throw new HttpException(
					403,
					BUSINESS_LOGIC_ERRORS,
					"user role is not allowed to access this resource"
				);
			}

			res.locals.user = user;
			res.locals.token = decoded;
			next();
		} catch (error) {
			next(error);
		}
	};
};

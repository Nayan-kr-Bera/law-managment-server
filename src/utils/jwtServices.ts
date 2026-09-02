import jwt, { SignOptions } from "jsonwebtoken";
import type { IUserJwtPayload, IClientJwtPayload } from "../@types/payload.types.js";
import { config } from "../config/index.js";

class JwtService {
  static sign(
    payload: string | Buffer | object,
    expiry: SignOptions["expiresIn"] = "1h",
    secret: string = config.ACCESS_SECRET ?? "",
  ): string {
    const options: SignOptions = { expiresIn: expiry };
    return jwt.sign(payload, secret, options);
  }

  static verify<T = IUserJwtPayload>(
    token: string,
    secret: string = config.ACCESS_SECRET ?? "",
  ): T {
    return jwt.verify(token, secret) as T;
  }

  static verifyUser(
    token: string,
    secret: string = config.ACCESS_SECRET ?? "",
  ): IUserJwtPayload {
    return jwt.verify(token, secret) as IUserJwtPayload;
  }

  static verifyClient(
    token: string,
    secret: string = config.ACCESS_SECRET ?? "",
  ): IClientJwtPayload {
    return jwt.verify(token, secret) as IClientJwtPayload;
  }
}

export default JwtService;

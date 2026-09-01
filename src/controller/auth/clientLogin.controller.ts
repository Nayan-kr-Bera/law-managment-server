import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import db from "../../db/index.js";
import { eq } from "drizzle-orm";
import { clientUsers } from "../../db/schema/index.js";
import JwtService from "../../utils/jwtServices.js";
import { IClientJwtPayload } from "../../@types/payload.types.js";
import { config } from "../../index.js";

const clientAuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      const clientUser = await db.query.clientUsers.findFirst({
        where: eq(clientUsers.email, email),
        with: {
          client: true,
        },
      });

      if (!clientUser) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const valid = await bcrypt.compare(password, clientUser.passwordHash);

      if (!valid) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const payload: IClientJwtPayload = {
        clientUserId: clientUser.id,
        clientId: clientUser.clientId!,
        email: clientUser.email,
      };

      const accessToken = JwtService.sign(payload, "7d", config.ACCESS_SECRET);

      return res.json({
        success: true,
        accessToken,
      });
    } catch (err) {
      next(err);
    }
  },
};

export default clientAuthController;

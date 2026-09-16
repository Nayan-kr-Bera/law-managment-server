import dotenv from "dotenv";
dotenv.config();
export const config = {
  PORT: Number(process.env.PORT) || 8000,
  DB_URL: process.env.DB_URL,
  NODE_ENV: process.env.NODE_ENV || "development",
  ORIGIN_FRONTEND: process.env.ORIGIN_FRONTEND,
  ORIGIN_CLIENT: process.env.ORIGIN_CLIENT,
  BASE_URL: process.env.BASE_URL,
  APP_NAME: process.env.APP_NAME,
  REFRESH_SECRET: process.env.REFRESH_SECRET,
  ACCESS_SECRET: process.env.ACCESS_SECRET,
  SALT: process.env.SALT,
  SMTP_HOST: process.env.SMTP_HOST || "mail.smtp2go.com",
  SMTP_PORT: Number(process.env.SMTP_PORT) || 2525,
  SMTP_MAIL: process.env.SMTP_MAIL || process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
  SMTP_SRC: process.env.SMTP_SRC || "false",
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RABBITMQ_URL: process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672",
};

import { registerAs } from '@nestjs/config';

/** Database configuration (PostgreSQL). No credentials in source. */
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? '',
}));

import { Pool } from "pg";
import { config } from "@postly/shared";

export const pool = new Pool({ connectionString: config.database.url });

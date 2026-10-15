import "server-only";
import { tenantOAuthSource } from "../calendly/connection-source";

export const instagramConnectionSource = tenantOAuthSource("instagram");

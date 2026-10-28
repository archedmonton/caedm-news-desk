import { env } from "./env";

/** Help & support contact shown in the app and the recipient of feature requests. */
export function developerContact() {
  return { name: env().DEVELOPER_NAME, email: env().DEVELOPER_EMAIL.toLowerCase() };
}

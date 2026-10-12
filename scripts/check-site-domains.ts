import { APP_ROOT_DOMAIN, SITES_ROOT_DOMAIN } from "../src/platform/infra/brand";

// Importing the shared Edge/browser validator fails the check before lint,
// tests or a build can mask malformed build-time domain configuration.
console.log(`Hosted-site domain configuration valid: app=${APP_ROOT_DOMAIN}, sites=${SITES_ROOT_DOMAIN}`);

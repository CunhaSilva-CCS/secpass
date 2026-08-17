export const DEVICE_AUTH_NOT_CONFIGURED = "device_auth_not_configured";

export const isDeviceAuthNotConfiguredError = (err) =>
  typeof err?.message === "string" &&
  /no user authentication method configured/i.test(err.message);

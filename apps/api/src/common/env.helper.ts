export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `FATAL: Environment variable "${name}" is required but not set.`,
    );
  }
  return value;
}

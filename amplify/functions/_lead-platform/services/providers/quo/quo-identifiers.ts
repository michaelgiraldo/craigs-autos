export function isQuoPhoneNumberId(value: string): boolean {
  return /^PN[\w-]+$/.test(value.trim());
}

export function isQuoUserId(value: string): boolean {
  return /^US[\w-]+$/.test(value.trim());
}

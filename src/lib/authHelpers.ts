export function normalizeEmployeeId(value: string): string {
  return value.trim().toUpperCase().replace(/^EMP/, '').replace(/\D/g, '').slice(0, 6);
}

export function employeeLoginAlias(employeeId: string): string {
  return `emp${normalizeEmployeeId(employeeId)}@thinktime.local`;
}

export function isValidEmployeeId(value: string): boolean {
  return /^\d{6}$/.test(normalizeEmployeeId(value));
}

export function firebaseAuthMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid Employee ID or password.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is disabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a little and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase Authentication. Check your internet connection.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact an administrator.';
    default:
      return error instanceof Error ? error.message : 'Sign-in failed.';
  }
}

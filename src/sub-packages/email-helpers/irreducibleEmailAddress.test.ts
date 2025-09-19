import { describe, it, expect } from 'vitest';
import { irreducibleEmailAddress } from './irreducibleEmailAddress.ts';

describe('irreducibleEmailAddress', () => {
  // Test case for a standard Gmail address with a plus alias
  it('should remove the plus alias from a Gmail address', () => {
    expect(irreducibleEmailAddress('test.user+alias@gmail.com')).toBe('testuser@gmail.com');
  });

  // Test case for a Gmail address with periods in the local part
  it('should remove periods from the local part of a Gmail address', () => {
    expect(irreducibleEmailAddress('test.user.name@gmail.com')).toBe('testusername@gmail.com');
  });

  // Test case for a Gmail address with both a plus alias and periods
  it('should handle both plus aliases and periods in a Gmail address', () => {
    expect(irreducibleEmailAddress('first.last+work@gmail.com')).toBe('firstlast@gmail.com');
  });

  // Test case for a non-Gmail address
  it('should only lowercase a non-Gmail address', () => {
    expect(irreducibleEmailAddress('User.Name@example.com')).toBe('user.name@example.com');
  });

  // Test case for an email address with leading/trailing whitespace
  it('should trim whitespace from the beginning and end of the email', () => {
    expect(irreducibleEmailAddress('  test@example.com  ')).toBe('test@example.com');
  });

  // Test case for an undefined input
  it('should return undefined for an undefined email address', () => {
    expect(irreducibleEmailAddress(undefined)).toBeUndefined();
  });

  // Test case for an empty string input
  it('should return undefined for an empty email address', () => {
    expect(irreducibleEmailAddress('')).toBeUndefined();
  });

  // Test case for an invalid email without a domain
  it('should return undefined for an email without a domain', () => {
    expect(irreducibleEmailAddress('testuser')).toBeUndefined();
  });

  // Test case for an invalid email without a local part
  it('should return undefined for an email without a local part', () => {
    expect(irreducibleEmailAddress('@gmail.com')).toBeUndefined();
  });

  // Test case for a standard email that should only be lowercased
  it('should only lowercase a standard email address', () => {
    expect(irreducibleEmailAddress('Standard.Email@domain.com')).toBe('standard.email@domain.com');
  });

  // Test case for an email with a plus alias but not a Gmail address
  it('should not remove the plus alias from a non-Gmail address', () => {
    expect(irreducibleEmailAddress('user+alias@yahoo.com')).toBe('user@yahoo.com');
  });
});
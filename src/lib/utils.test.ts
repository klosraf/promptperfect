import { describe, it, expect } from 'vitest';
import { cn, cvaLite } from './utils';

describe('cn', () => {
  it('joins truthy class strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('filters out falsy values', () => {
    expect(cn('a', null, undefined, false, '', 'b')).toBe('a b');
  });

  it('flattens nested arrays', () => {
    expect(cn('a', ['b', ['c']], 'd')).toBe('a b c d');
  });

  it('keeps object keys whose value is truthy', () => {
    expect(cn('a', { b: true, c: false, d: 1 })).toBe('a b d');
  });

  it('returns empty string when nothing is provided', () => {
    expect(cn()).toBe('');
  });
});

describe('cvaLite', () => {
  const btn = cvaLite('base', {
    variants: {
      variant: { primary: 'text-white', ghost: 'text-black' },
      size: { sm: 'h-8', lg: 'h-12' },
    },
    defaultVariants: { variant: 'primary', size: 'sm' },
  });

  it('applies default variants', () => {
    expect(btn()).toBe('base text-white h-8');
  });

  it('applies explicit variants', () => {
    expect(btn({ variant: 'ghost', size: 'lg' })).toBe(
      'base text-black h-12',
    );
  });

  it('appends className last so callers can override', () => {
    expect(btn({ className: 'mt-2' })).toBe('base text-white h-8 mt-2');
  });
});

import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index.js';

describe('scaffold', () => {
  it('exports a package identity', () => {
    expect(PACKAGE_NAME).toBe('@makerlord/parts');
  });
});

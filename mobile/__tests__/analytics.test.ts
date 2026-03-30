import { logEvent } from '../src/analytics';

describe('analytics', () => {
  it('logEvent resolves without throwing', async () => {
    await expect(logEvent('test_event', { a: 1 })).resolves.toBeUndefined();
  });
});

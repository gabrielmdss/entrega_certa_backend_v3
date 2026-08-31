import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main/app.js';
import { dependencies } from '../../../src/main/dependencies.js';

describe('bootstrap HTTP', () => {
  const app = createApp();
  afterAll(async () => dependencies.postgresPool.end());

  it('responde healthcheck e request ID', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('publica o contrato OpenAPI', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
  });
});

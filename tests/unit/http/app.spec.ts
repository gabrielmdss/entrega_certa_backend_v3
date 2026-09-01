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

  it('mantém health e readiness públicos sem depender de Origin', async () => {
    const health = await request(app).get('/health');
    const ready = await request(app).get('/ready');

    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });

  it('publica o contrato OpenAPI', async () => {
    const response = await request(app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.paths['/api/v1/pessoas'].get).toBeDefined();
    expect(response.body.paths['/api/v1/pessoas'].post).toBeDefined();
    expect(response.body.paths['/api/v1/grupos-distribuicao'].get).toBeDefined();
    expect(response.body.paths['/api/v1/motivos-desligamento'].get).toBeDefined();
    expect(response.body.paths['/api/v1/candidaturas/{id}/tentativas-contato'].post).toBeDefined();
    expect(response.body.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(response.body.paths['/api/v1/auth/login'].post.security).toBeUndefined();
    expect(response.body.paths['/api/v1/auth/me'].get.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(response.body.paths).length).toBeGreaterThan(50);
  });

  it('monta as novas rotas sob autenticação', async () => {
    for (const path of ['/api/v1/pessoas?q=Maria','/api/v1/grupos-distribuicao','/api/v1/motivos-desligamento']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('não intercepta a rota pública de login com o middleware dos catálogos', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({ login: 'usuario-inexistente', senha: 'invalida' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('CREDENCIAIS_INVALIDAS');
  });

  it('protege auth/me e módulos sensíveis sem token', async () => {
    for (const path of [
      '/api/v1/auth/me',
      '/api/v1/beneficiarios',
      '/api/v1/estoque/insumos',
      '/api/v1/auditoria',
    ]) {
      const response = await request(app).get(path);
      expect(response.status, path).toBe(401);
      expect(response.body.error.code, path).toBe('NAO_AUTENTICADO');
    }
  });
});

import pactum from 'pactum';
import { SimpleReporter } from '../simple-reporter';
import { faker } from '@faker-js/faker';
import { StatusCodes } from 'http-status-codes';
import data from '../data/data.json';

describe('Webhook.site API', () => {
  let tokenId = '';
  let requestId = '';
  const descricao = faker.lorem.sentence();
  const mensagem = faker.lorem.words(3);
  const novaDescricao = faker.lorem.sentence();
  const novaMensagem = faker.lorem.words(3);
  const produto = {
    nome: faker.commerce.productName(),
    quantidade: faker.number.int({ min: 1, max: 100 })
  };
  const atualizacao = {
    quantidade: faker.number.int({ min: 101, max: 200 })
  };
  const p = pactum;
  const rep = SimpleReporter;
  const baseUrl = 'https://webhook.site';

  p.request.setDefaultTimeout(30000);
  p.request.setDefaultHeaders({
    Accept: 'application/json',
    // evita ECONNRESET ao reaproveitar conexões que o servidor já fechou
    Connection: 'close'
  });

  beforeAll(async () => {
    p.reporter.add(rep);

    tokenId = await p
      .spec()
      .post(`${baseUrl}/token`)
      .withJson({
        description: descricao,
        default_status: StatusCodes.ACCEPTED,
        default_content: JSON.stringify({ mensagem }),
        default_content_type: 'application/json'
      })
      .expectStatus(StatusCodes.CREATED)
      .returns('uuid');
  });

  describe('Token - consulta', () => {
    it('Buscar token criado', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}`)
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({
          uuid: tokenId,
          description: descricao,
          default_status: StatusCodes.ACCEPTED,
          default_content_type: 'application/json'
        })
        .expectJsonSchema({
          type: 'object',
          properties: {
            uuid: {
              type: 'string'
            },
            description: {
              type: 'string'
            },
            default_status: {
              type: 'integer'
            },
            default_content: {
              type: 'string'
            },
            default_content_type: {
              type: 'string'
            },
            expires_at: {
              type: 'string'
            }
          },
          required: [
            'uuid',
            'description',
            'default_status',
            'default_content',
            'default_content_type',
            'expires_at'
          ]
        });
    });

    it('Token com status inválido', async () => {
      await p
        .spec()
        .post(`${baseUrl}/token`)
        .withJson({
          default_status: 999
        })
        .expectStatus(StatusCodes.UNPROCESSABLE_ENTITY)
        .expectJsonLike({
          default_status: ['The default status may not be greater than 599.']
        });
    });

    it('Buscar token inexistente', async () => {
      const idInexistente = faker.string.uuid();

      await p
        .spec()
        .get(`${baseUrl}/token/${idInexistente}`)
        .expectStatus(StatusCodes.NOT_FOUND)
        .expectJsonLike({
          success: false,
          error: {
            message: `Token "${idInexistente}" not found`
          }
        });
    });
  });

  describe('Webhook - envio de requisições', () => {
    it('Enviar POST com JSON', async () => {
      requestId = await p
        .spec()
        .post(`${baseUrl}/${tokenId}`)
        .withHeaders('X-Origem', 'pactum')
        .withJson(data.sucesso)
        .expectStatus(StatusCodes.ACCEPTED)
        .expectHeader('x-token-id', tokenId)
        .expectJsonLike({ mensagem })
        .returns(ctx => ctx.res.headers['x-request-id']);
    });

    it('Enviar POST com formulário', async () => {
      await p
        .spec()
        .post(`${baseUrl}/${tokenId}`)
        .withForm({
          nome: faker.person.firstName(),
          curso: 'testes de api'
        })
        .expectStatus(StatusCodes.ACCEPTED);
    });

    it('Enviar GET com query params', async () => {
      await p
        .spec()
        .get(`${baseUrl}/${tokenId}`)
        .withQueryParams({
          origem: 'pactum',
          pagina: '1'
        })
        .expectStatus(StatusCodes.ACCEPTED)
        .expectHeaderContains('content-type', 'application/json');
    });

    it('Enviar PUT', async () => {
      await p
        .spec()
        .put(`${baseUrl}/${tokenId}`)
        .withJson(produto)
        .expectStatus(StatusCodes.ACCEPTED)
        .expectJsonLike({ mensagem });
    });

    it('Enviar PATCH', async () => {
      await p
        .spec()
        .patch(`${baseUrl}/${tokenId}`)
        .withJson(atualizacao)
        .expectStatus(StatusCodes.ACCEPTED)
        .expectJsonLike({ mensagem });
    });

    it('Enviar DELETE', async () => {
      await p
        .spec()
        .delete(`${baseUrl}/${tokenId}`)
        .expectStatus(StatusCodes.ACCEPTED)
        .expectJsonLike({ mensagem });
    });

    it('Enviar HEAD', async () => {
      await p
        .spec()
        .head(`${baseUrl}/${tokenId}`)
        .expectStatus(StatusCodes.ACCEPTED);
    });

    it('Enviar OPTIONS', async () => {
      await p
        .spec()
        .options(`${baseUrl}/${tokenId}`)
        .expectStatus(StatusCodes.ACCEPTED);
    });
  });

  describe('Requisições capturadas', () => {
    it('Listar requisições recebidas', async () => {
      // as requisições recebidas são gravadas de forma assíncrona pela API
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/requests`)
        .retry(5, 1000)
        .expectStatus(StatusCodes.OK)
        .expectJson('total', 8)
        .expectJsonLength('data', 8)
        .expectJsonSchema({
          type: 'object',
          properties: {
            data: {
              type: 'array'
            },
            total: {
              type: 'integer'
            },
            per_page: {
              type: 'integer'
            },
            current_page: {
              type: 'integer'
            },
            is_last_page: {
              type: 'boolean'
            }
          },
          required: [
            'data',
            'total',
            'per_page',
            'current_page',
            'is_last_page'
          ]
        });
    });

    it('Filtrar requisições pelo método PATCH', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/requests`)
        .withQueryParams('query', 'method:PATCH')
        .expectStatus(StatusCodes.OK)
        .expectJson('total', 1)
        .expectJsonLike({
          data: [
            {
              method: 'PATCH',
              content: JSON.stringify(atualizacao)
            }
          ]
        });
    });

    it('Filtrar requisições pelo método GET', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/requests`)
        .withQueryParams('query', 'method:GET')
        .expectStatus(StatusCodes.OK)
        .expectJson('total', 1)
        .expectJsonLike({
          data: [
            {
              method: 'GET',
              query: {
                origem: 'pactum',
                pagina: '1'
              }
            }
          ]
        });
    });

    it('Buscar a última requisição recebida', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/request/latest`)
        .expectStatus(StatusCodes.OK)
        .expectJson('method', 'OPTIONS');
    });

    it('Buscar requisição pelo id', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/request/${requestId}`)
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({
          uuid: requestId,
          token_id: tokenId,
          method: 'POST',
          content: JSON.stringify(data.sucesso),
          headers: {
            'x-origem': ['pactum']
          }
        });
    });

    it('Buscar conteúdo original da requisição', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/request/${requestId}/raw`)
        .expectStatus(StatusCodes.OK)
        .expectJson(data.sucesso);
    });

    it('Excluir requisição pelo id', async () => {
      await p
        .spec()
        .delete(`${baseUrl}/token/${tokenId}/request/${requestId}`)
        .expectStatus(StatusCodes.OK)
        .expectJson({ status: true });
    });

    it('Buscar requisição excluída', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/request/${requestId}`)
        .expectStatus(StatusCodes.NOT_FOUND)
        .expectJsonLike({
          success: false,
          error: {
            message: `Request "${requestId}" not found`
          }
        });
    });

    it('Excluir todas as requisições', async () => {
      await p
        .spec()
        .delete(`${baseUrl}/token/${tokenId}/request`)
        .expectStatus(StatusCodes.OK)
        .expectJson({ status: true });
    });

    it('Listar requisições após exclusão', async () => {
      // a exclusão em massa é processada de forma assíncrona pela API
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}/requests`)
        .retry(5, 1000)
        .expectStatus(StatusCodes.OK)
        .expectJson('total', 0);
    });
  });

  describe('Token - alteração', () => {
    it('Alterar token', async () => {
      await p
        .spec()
        .put(`${baseUrl}/token/${tokenId}`)
        .withJson({
          description: novaDescricao,
          default_status: StatusCodes.CREATED,
          default_content: novaMensagem,
          default_content_type: 'text/plain'
        })
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({
          uuid: tokenId,
          description: novaDescricao,
          default_status: StatusCodes.CREATED,
          default_content: novaMensagem,
          default_content_type: 'text/plain'
        });
    });

    it('Webhook responde com a nova configuração', async () => {
      await p
        .spec()
        .post(`${baseUrl}/${tokenId}`)
        .withJson(data.sucesso)
        .expectStatus(StatusCodes.CREATED)
        .expectHeaderContains('content-type', 'text/plain')
        .expectBody(novaMensagem);
    });

    it('PUT sem configuração volta ao padrão', async () => {
      await p
        .spec()
        .put(`${baseUrl}/token/${tokenId}`)
        .withJson({
          description: novaDescricao
        })
        .expectStatus(StatusCodes.OK)
        .expectJsonLike({
          description: novaDescricao,
          default_status: StatusCodes.OK,
          default_content: ''
        });
    });
  });

  describe('Token - exclusão', () => {
    it('Excluir token', async () => {
      await p
        .spec()
        .delete(`${baseUrl}/token/${tokenId}`)
        .expectStatus(StatusCodes.NO_CONTENT);
    });

    it('Buscar token excluído', async () => {
      await p
        .spec()
        .get(`${baseUrl}/token/${tokenId}`)
        .expectStatus(StatusCodes.NOT_FOUND)
        .expectJsonLike({
          success: false,
          error: {
            message: `Token "${tokenId}" not found`
          }
        });
    });

    it('Enviar requisição para token excluído', async () => {
      await p
        .spec()
        .post(`${baseUrl}/${tokenId}`)
        .withJson(data.sucesso)
        .expectStatus(StatusCodes.NOT_FOUND);
    });
  });

  afterAll(() => p.reporter.end());
});

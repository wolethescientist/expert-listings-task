import Fastify from 'fastify';
import type pg from 'pg';
import { createListingSchema, idSchema, listSchema, patchListingSchema, searchSchema } from './schemas.js';
import { createListing, deleteListing, getListing, listListings, searchListings, updateListing } from './repository.js';
import { toListing } from './types.js';
import type { ListingInput, ListingPatch, PaginationQuery, SearchQuery } from './types.js';

interface IdParams { id: string }

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export function buildApp(pool: pg.Pool, options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true, ajv: { customOptions: { removeAdditional: false } } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof Error && 'validation' in error && error.validation) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: error.message } });
    }
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: { code: 'REQUEST_ERROR', message: error.message } });
    }
    request.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.register(async (v1) => {
    v1.post<{ Body: ListingInput }>('/listings', { schema: createListingSchema }, async (request, reply) => {
      const listing = toListing(await createListing(pool, request.body));
      return reply.code(201).header('Location', `/api/v1/listings/${listing.id}`).send({ data: listing });
    });

    v1.get<{ Querystring: PaginationQuery }>('/listings', { schema: listSchema }, async (request) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const { rows, total } = await listListings(pool, page, limit);
      return { data: rows.map(toListing), pagination: pagination(page, limit, total) };
    });

    v1.get<{ Querystring: SearchQuery }>('/listings/search', { schema: searchSchema }, async (request, reply) => {
      const { minPrice, maxPrice } = request.query;
      if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        return reply.code(400).send({ error: { code: 'INVALID_PRICE_RANGE', message: 'minPrice must be less than or equal to maxPrice' } });
      }
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const { rows, total } = await searchListings(pool, request.query, page, limit);
      return { data: rows.map(toListing), pagination: pagination(page, limit, total) };
    });

    v1.get<{ Params: IdParams }>('/listings/:id', { schema: idSchema }, async (request, reply) => {
      const row = await getListing(pool, request.params.id);
      if (!row) return reply.code(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } });
      return { data: toListing(row) };
    });

    v1.patch<{ Params: IdParams; Body: ListingPatch }>('/listings/:id', { schema: { ...idSchema, ...patchListingSchema } }, async (request, reply) => {
      const row = await updateListing(pool, request.params.id, request.body);
      if (!row) return reply.code(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } });
      return { data: toListing(row) };
    });

    v1.delete<{ Params: IdParams }>('/listings/:id', { schema: idSchema }, async (request, reply) => {
      const deleted = await deleteListing(pool, request.params.id);
      if (!deleted) return reply.code(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } });
      return reply.code(204).send();
    });
  }, { prefix: '/api/v1' });

  return app;
}

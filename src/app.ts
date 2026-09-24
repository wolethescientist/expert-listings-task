import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type pg from 'pg';
import {
  createListingSchema, errorEnvelope, idSchema, listSchema, listingEnvelope,
  listingPageEnvelope, patchListingSchema, searchPageEnvelope, searchSchema,
} from './schemas.js';
import { createListing, deleteListing, getListing, listListings, searchListings, updateListing } from './repository.js';
import { toListing } from './types.js';
import type { ListingInput, ListingPatch, PaginationQuery, SearchQuery } from './types.js';

interface IdParams { id: string }

function pagination(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export function buildApp(pool: pg.Pool, options: { logger?: boolean } = {}) {
  const app = Fastify({ logger: options.logger ?? true, ajv: { customOptions: { removeAdditional: false } } });

  app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Property Listings API',
        description: 'Version 1 of the property listings API. Use Try it out to create listings and search nearby properties.',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'This server' }],
      tags: [
        { name: 'Listings', description: 'Create, manage, and search property listings' },
        { name: 'System', description: 'Process status' },
      ],
    },
  });
  app.register(swaggerUi, { routePrefix: '/docs', uiConfig: { docExpansion: 'list', deepLinking: true } });

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

  app.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Check process health',
      response: { 200: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } } },
    },
  }, async () => ({ status: 'ok' }));

  app.register(async (v1) => {
    v1.post<{ Body: ListingInput }>('/listings', {
      schema: {
        ...createListingSchema, tags: ['Listings'], summary: 'Create a listing',
        response: { 201: listingEnvelope, 400: errorEnvelope, 500: errorEnvelope },
      },
    }, async (request, reply) => {
      const listing = toListing(await createListing(pool, request.body));
      return reply.code(201).header('Location', `/api/v1/listings/${listing.id}`).send({ data: listing });
    });

    v1.get<{ Querystring: PaginationQuery }>('/listings', {
      schema: {
        ...listSchema, tags: ['Listings'], summary: 'List all listings',
        response: { 200: listingPageEnvelope, 400: errorEnvelope, 500: errorEnvelope },
      },
    }, async (request) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const { rows, total } = await listListings(pool, page, limit);
      return { data: rows.map(toListing), pagination: pagination(page, limit, total) };
    });

    v1.get<{ Querystring: SearchQuery }>('/listings/search', {
      schema: {
        ...searchSchema, tags: ['Listings'], summary: 'Search listings near a point',
        description: 'Returns listings within radiusKm, ordered by distance. Optional filters are inclusive price bounds, exact bedrooms, and listing type.',
        response: { 200: searchPageEnvelope, 400: errorEnvelope, 500: errorEnvelope },
      },
    }, async (request, reply) => {
      const { minPrice, maxPrice } = request.query;
      if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        return reply.code(400).send({ error: { code: 'INVALID_PRICE_RANGE', message: 'minPrice must be less than or equal to maxPrice' } });
      }
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const { rows, total } = await searchListings(pool, request.query, page, limit);
      return { data: rows.map(toListing), pagination: pagination(page, limit, total) };
    });

    v1.get<{ Params: IdParams }>('/listings/:id', {
      schema: {
        ...idSchema, tags: ['Listings'], summary: 'Get a listing by ID',
        response: { 200: listingEnvelope, 400: errorEnvelope, 404: errorEnvelope, 500: errorEnvelope },
      },
    }, async (request, reply) => {
      const row = await getListing(pool, request.params.id);
      if (!row) return reply.code(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } });
      return { data: toListing(row) };
    });

    v1.patch<{ Params: IdParams; Body: ListingPatch }>('/listings/:id', {
      schema: {
        ...idSchema, ...patchListingSchema, tags: ['Listings'], summary: 'Update a listing',
        description: 'Supply a non-empty subset of listing fields. A location update must include address, lat, and lng.',
        response: { 200: listingEnvelope, 400: errorEnvelope, 404: errorEnvelope, 500: errorEnvelope },
      },
    }, async (request, reply) => {
      const row = await updateListing(pool, request.params.id, request.body);
      if (!row) return reply.code(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } });
      return { data: toListing(row) };
    });

    v1.delete<{ Params: IdParams }>('/listings/:id', {
      schema: {
        ...idSchema, tags: ['Listings'], summary: 'Delete a listing',
        response: { 204: { type: 'null', description: 'Listing deleted' }, 400: errorEnvelope, 404: errorEnvelope, 500: errorEnvelope },
      },
    }, async (request, reply) => {
      const deleted = await deleteListing(pool, request.params.id);
      if (!deleted) return reply.code(404).send({ error: { code: 'LISTING_NOT_FOUND', message: 'Listing not found' } });
      return reply.code(204).send();
    });
  }, { prefix: '/api/v1' });

  return app;
}

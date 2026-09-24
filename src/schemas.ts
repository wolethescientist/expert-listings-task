const uuid = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const;

const location = {
  type: 'object',
  additionalProperties: false,
  required: ['address', 'lat', 'lng'],
  properties: {
    address: { type: 'string', minLength: 1, maxLength: 300, pattern: '\\S' },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

const listingProperties = {
  title: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
  price: { type: 'integer', minimum: 0, maximum: 1000000000000, description: 'Whole Nigerian naira' },
  type: { type: 'string', enum: ['rent', 'sale', 'shortlet'] },
  bedrooms: { type: 'integer', minimum: 0, maximum: 100 },
  location,
  agentId: uuid,
} as const;

export const createListingSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'price', 'type', 'bedrooms', 'location', 'agentId'],
    properties: listingProperties,
    examples: [{
      title: 'Three-bedroom apartment in Lekki',
      price: 50000000,
      type: 'sale',
      bedrooms: 3,
      location: { address: 'Lekki Phase 1, Lagos', lat: 6.4474, lng: 3.4737 },
      agentId: '11111111-1111-4111-8111-111111111111',
    }],
  },
} as const;

export const patchListingSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: listingProperties,
  },
} as const;

export const idSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: uuid },
  },
} as const;

const paginationProperties = {
  page: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
} as const;

export const listSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: paginationProperties,
  },
} as const;

export const searchSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    required: ['lat', 'lng', 'radiusKm'],
    properties: {
      ...paginationProperties,
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lng: { type: 'number', minimum: -180, maximum: 180 },
      radiusKm: { type: 'number', exclusiveMinimum: 0, maximum: 20000, description: 'Inclusive search radius in kilometres' },
      type: { type: 'string', enum: ['rent', 'sale', 'shortlet'] },
      minPrice: { type: 'integer', minimum: 0, maximum: 1000000000000 },
      maxPrice: { type: 'integer', minimum: 0, maximum: 1000000000000 },
      bedrooms: { type: 'integer', minimum: 0, maximum: 100 },
    },
  },
} as const;

const listingResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'price', 'type', 'bedrooms', 'location', 'agentId', 'createdAt', 'updatedAt'],
  properties: {
    id: uuid,
    ...listingProperties,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const searchListingResponse = {
  ...listingResponse,
  required: [...listingResponse.required, 'distanceKm'],
  properties: {
    ...listingResponse.properties,
    distanceKm: { type: 'number', minimum: 0, description: 'Distance from the requested point, rounded to 3 decimal places' },
  },
} as const;

const paginationResponse = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages'],
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
} as const;

export const listingEnvelope = {
  type: 'object',
  required: ['data'],
  properties: { data: listingResponse },
} as const;

export const listingPageEnvelope = {
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: { type: 'array', items: listingResponse },
    pagination: paginationResponse,
  },
} as const;

export const searchPageEnvelope = {
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: { type: 'array', items: searchListingResponse },
    pagination: paginationResponse,
  },
} as const;

export const errorEnvelope = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
} as const;

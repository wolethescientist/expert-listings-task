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
  price: { type: 'integer', minimum: 0, maximum: 1000000000000 },
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
      radiusKm: { type: 'number', exclusiveMinimum: 0, maximum: 20000 },
      type: { type: 'string', enum: ['rent', 'sale', 'shortlet'] },
      minPrice: { type: 'integer', minimum: 0, maximum: 1000000000000 },
      maxPrice: { type: 'integer', minimum: 0, maximum: 1000000000000 },
      bedrooms: { type: 'integer', minimum: 0, maximum: 100 },
    },
  },
} as const;

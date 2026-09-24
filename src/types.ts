export type ListingType = 'rent' | 'sale' | 'shortlet';

export interface LocationInput {
  address: string;
  lat: number;
  lng: number;
}

export interface ListingInput {
  title: string;
  price: number;
  type: ListingType;
  bedrooms: number;
  location: LocationInput;
  agentId: string;
}

export type ListingPatch = Partial<ListingInput>;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface SearchQuery extends PaginationQuery {
  lat: number;
  lng: number;
  radiusKm: number;
  type?: ListingType;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
}

export interface ListingRow {
  id: string;
  title: string;
  price: string;
  type: ListingType;
  bedrooms: number;
  location_text: string;
  latitude: number;
  longitude: number;
  agent_id: string;
  created_at: Date;
  updated_at: Date;
  distance_km?: number;
}

export function toListing(row: ListingRow) {
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    type: row.type,
    bedrooms: row.bedrooms,
    location: {
      address: row.location_text,
      lat: row.latitude,
      lng: row.longitude,
    },
    agentId: row.agent_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.distance_km === undefined ? {} : { distanceKm: Number(row.distance_km.toFixed(3)) }),
  };
}

import type { Size } from '../types';

export interface StoreInfo {
  name: string;
  slogan: string;
  audience: string;
  priceRange: [number, number];
  humanServiceHours: string;
  aiServiceHours: number;
  agentName: string;
  freeShippingThreshold: number;
  defaultCarrier: string;
  goldCarrier: string;
  shippingWithinHours: number;
}

export interface SizeChartRow {
  size: Size;
  heightCm: [number, number];
  weightKg: [number, number];
  bustCm: number;
  waistCm: number;
}

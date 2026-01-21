/**
 * Shopify Admin API Client
 * 
 * Uses Shopify's Admin REST API to manage products, orders, inventory, etc.
 * @see https://shopify.dev/docs/api/admin-rest
 */

import { getShopifyCredentials, type ShopifyCredentials } from '../store/secureStorage';

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Shopify API Error
 */
export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errors?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

/**
 * Base fetch function for Shopify API
 */
async function shopifyFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  credentials?: ShopifyCredentials
): Promise<T> {
  const creds = credentials || getShopifyCredentials();
  if (!creds) {
    throw new ShopifyApiError('Shopify not connected. Please connect your store first.');
  }

  const { accessToken, shopDomain } = creds;
  const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorData: { errors?: Record<string, string[]> } = {};
    try {
      errorData = await response.json();
    } catch {
      // Ignore JSON parse errors
    }
    throw new ShopifyApiError(
      `Shopify API error: ${response.status} ${response.statusText}`,
      response.status,
      errorData.errors
    );
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// Types
// ============================================================================

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  created_at: string;
  handle: string;
  updated_at: string;
  published_at: string | null;
  status: 'active' | 'archived' | 'draft';
  tags: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options: ShopifyOption[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  position: number;
  inventory_policy: string;
  compare_at_price: string | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  created_at: string;
  updated_at: string;
  taxable: boolean;
  barcode: string | null;
  grams: number;
  weight: number;
  weight_unit: string;
  inventory_item_id: number;
  inventory_quantity: number;
  requires_shipping: boolean;
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  position: number;
  created_at: string;
  updated_at: string;
  alt: string | null;
  width: number;
  height: number;
  src: string;
  variant_ids: number[];
}

export interface ShopifyOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyOrder {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  name: string;
  order_number: number;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
}

export interface ShopifyLineItem {
  id: number;
  variant_id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  variant_title: string;
  vendor: string;
  product_id: number;
  name: string;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  created_at: string;
  updated_at: string;
  phone: string | null;
}

export interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string | null;
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
  updated_at: string;
}

export interface ShopifyLocation {
  id: number;
  name: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  active: boolean;
}

// ============================================================================
// Products API
// ============================================================================

/**
 * Get all products (paginated)
 */
export async function getProducts(params?: {
  limit?: number;
  page_info?: string;
  status?: 'active' | 'archived' | 'draft';
  collection_id?: number;
  product_type?: string;
  vendor?: string;
}): Promise<{ products: ShopifyProduct[]; nextPageInfo?: string }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.page_info) searchParams.set('page_info', params.page_info);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.collection_id) searchParams.set('collection_id', String(params.collection_id));
  if (params?.product_type) searchParams.set('product_type', params.product_type);
  if (params?.vendor) searchParams.set('vendor', params.vendor);

  const query = searchParams.toString();
  const endpoint = `/products.json${query ? `?${query}` : ''}`;
  
  const response = await shopifyFetch<{ products: ShopifyProduct[] }>(endpoint);
  return { products: response.products };
}

/**
 * Get a single product by ID
 */
export async function getProduct(productId: number): Promise<ShopifyProduct> {
  const response = await shopifyFetch<{ product: ShopifyProduct }>(`/products/${productId}.json`);
  return response.product;
}

/**
 * Create a new product
 */
export async function createProduct(product: Partial<ShopifyProduct>): Promise<ShopifyProduct> {
  const response = await shopifyFetch<{ product: ShopifyProduct }>('/products.json', {
    method: 'POST',
    body: JSON.stringify({ product }),
  });
  return response.product;
}

/**
 * Update an existing product
 */
export async function updateProduct(
  productId: number,
  updates: Partial<ShopifyProduct>
): Promise<ShopifyProduct> {
  const response = await shopifyFetch<{ product: ShopifyProduct }>(`/products/${productId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: updates }),
  });
  return response.product;
}

/**
 * Delete a product
 */
export async function deleteProduct(productId: number): Promise<void> {
  await shopifyFetch(`/products/${productId}.json`, { method: 'DELETE' });
}

/**
 * Search products by title
 */
export async function searchProducts(query: string, limit = 10): Promise<ShopifyProduct[]> {
  const response = await shopifyFetch<{ products: ShopifyProduct[] }>(
    `/products.json?title=${encodeURIComponent(query)}&limit=${limit}`
  );
  return response.products;
}

// ============================================================================
// Product Variants API
// ============================================================================

/**
 * Update a product variant (price, inventory, etc.)
 */
export async function updateVariant(
  variantId: number,
  updates: Partial<ShopifyVariant>
): Promise<ShopifyVariant> {
  const response = await shopifyFetch<{ variant: ShopifyVariant }>(
    `/variants/${variantId}.json`,
    {
      method: 'PUT',
      body: JSON.stringify({ variant: updates }),
    }
  );
  return response.variant;
}

// ============================================================================
// Product Images API
// ============================================================================

/**
 * Add an image to a product
 */
export async function addProductImage(
  productId: number,
  image: { src?: string; attachment?: string; alt?: string; position?: number }
): Promise<ShopifyImage> {
  const response = await shopifyFetch<{ image: ShopifyImage }>(
    `/products/${productId}/images.json`,
    {
      method: 'POST',
      body: JSON.stringify({ image }),
    }
  );
  return response.image;
}

/**
 * Delete a product image
 */
export async function deleteProductImage(productId: number, imageId: number): Promise<void> {
  await shopifyFetch(`/products/${productId}/images/${imageId}.json`, { method: 'DELETE' });
}

// ============================================================================
// Orders API
// ============================================================================

/**
 * Get all orders (paginated)
 */
export async function getOrders(params?: {
  limit?: number;
  status?: 'open' | 'closed' | 'cancelled' | 'any';
  financial_status?: string;
  fulfillment_status?: string;
  created_at_min?: string;
  created_at_max?: string;
}): Promise<{ orders: ShopifyOrder[] }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);
  if (params?.financial_status) searchParams.set('financial_status', params.financial_status);
  if (params?.fulfillment_status) searchParams.set('fulfillment_status', params.fulfillment_status);
  if (params?.created_at_min) searchParams.set('created_at_min', params.created_at_min);
  if (params?.created_at_max) searchParams.set('created_at_max', params.created_at_max);

  const query = searchParams.toString();
  const endpoint = `/orders.json${query ? `?${query}` : ''}`;
  
  return shopifyFetch<{ orders: ShopifyOrder[] }>(endpoint);
}

/**
 * Get a single order by ID
 */
export async function getOrder(orderId: number): Promise<ShopifyOrder> {
  const response = await shopifyFetch<{ order: ShopifyOrder }>(`/orders/${orderId}.json`);
  return response.order;
}

/**
 * Get order count
 */
export async function getOrderCount(params?: {
  status?: 'open' | 'closed' | 'cancelled' | 'any';
  financial_status?: string;
  fulfillment_status?: string;
}): Promise<number> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.financial_status) searchParams.set('financial_status', params.financial_status);
  if (params?.fulfillment_status) searchParams.set('fulfillment_status', params.fulfillment_status);

  const query = searchParams.toString();
  const endpoint = `/orders/count.json${query ? `?${query}` : ''}`;
  
  const response = await shopifyFetch<{ count: number }>(endpoint);
  return response.count;
}

// ============================================================================
// Inventory API
// ============================================================================

/**
 * Get inventory levels for an item
 */
export async function getInventoryLevels(inventoryItemId: number): Promise<ShopifyInventoryLevel[]> {
  const response = await shopifyFetch<{ inventory_levels: ShopifyInventoryLevel[] }>(
    `/inventory_levels.json?inventory_item_ids=${inventoryItemId}`
  );
  return response.inventory_levels;
}

/**
 * Set inventory level for an item at a location
 */
export async function setInventoryLevel(
  inventoryItemId: number,
  locationId: number,
  available: number
): Promise<ShopifyInventoryLevel> {
  const response = await shopifyFetch<{ inventory_level: ShopifyInventoryLevel }>(
    '/inventory_levels/set.json',
    {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available,
      }),
    }
  );
  return response.inventory_level;
}

/**
 * Adjust inventory level (add or subtract)
 */
export async function adjustInventoryLevel(
  inventoryItemId: number,
  locationId: number,
  adjustment: number
): Promise<ShopifyInventoryLevel> {
  const response = await shopifyFetch<{ inventory_level: ShopifyInventoryLevel }>(
    '/inventory_levels/adjust.json',
    {
      method: 'POST',
      body: JSON.stringify({
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available_adjustment: adjustment,
      }),
    }
  );
  return response.inventory_level;
}

/**
 * Get all locations
 */
export async function getLocations(): Promise<ShopifyLocation[]> {
  const response = await shopifyFetch<{ locations: ShopifyLocation[] }>('/locations.json');
  return response.locations;
}

// ============================================================================
// Customers API
// ============================================================================

/**
 * Get all customers (paginated)
 */
export async function getCustomers(params?: {
  limit?: number;
}): Promise<{ customers: ShopifyCustomer[] }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString();
  const endpoint = `/customers.json${query ? `?${query}` : ''}`;
  
  return shopifyFetch<{ customers: ShopifyCustomer[] }>(endpoint);
}

/**
 * Search customers by query
 */
export async function searchCustomers(query: string): Promise<ShopifyCustomer[]> {
  const response = await shopifyFetch<{ customers: ShopifyCustomer[] }>(
    `/customers/search.json?query=${encodeURIComponent(query)}`
  );
  return response.customers;
}

// ============================================================================
// Shop Info API
// ============================================================================

export interface ShopifyShop {
  id: number;
  name: string;
  email: string;
  domain: string;
  province: string;
  country: string;
  address1: string;
  zip: string;
  city: string;
  phone: string;
  currency: string;
  money_format: string;
  plan_name: string;
  myshopify_domain: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get shop information
 */
export async function getShop(): Promise<ShopifyShop> {
  const response = await shopifyFetch<{ shop: ShopifyShop }>('/shop.json');
  return response.shop;
}

// ============================================================================
// Connection Test
// ============================================================================

/**
 * Test if the Shopify connection is valid
 */
export async function testConnection(): Promise<{ success: boolean; shop?: ShopifyShop; error?: string }> {
  try {
    const shop = await getShop();
    return { success: true, shop };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

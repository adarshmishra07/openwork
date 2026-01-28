#!/usr/bin/env node
/**
 * Shopify MCP Server
 * 
 * Exposes Shopify Admin API operations as MCP tools for Claude Code to use.
 * Requires SHOPIFY_CREDENTIALS environment variable with JSON credentials.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Types
// ============================================================================

interface ShopifyCredentials {
  accessToken: string;
  shopDomain: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  status: string;
  tags: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  compare_at_price: string | null;
}

interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  created_at: string;
  line_items: Array<{
    title: string;
    quantity: number;
    price: string;
  }>;
}

// ============================================================================
// Shopify API Client
// ============================================================================

const SHOPIFY_API_VERSION = '2024-01';

function getCredentials(): ShopifyCredentials {
  const credsJson = process.env.SHOPIFY_CREDENTIALS;
  if (!credsJson) {
    throw new Error('SHOPIFY_CREDENTIALS environment variable not set. Please connect your Shopify store first.');
  }
  try {
    return JSON.parse(credsJson);
  } catch {
    throw new Error('Invalid SHOPIFY_CREDENTIALS format');
  }
}

async function shopifyFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const { accessToken, shopDomain } = getCredentials();
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
    const errorText = await response.text();
    throw new Error(`Shopify API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================================
// Permission Helper
// ============================================================================

const SHOPIFY_PERMISSION_API_URL = 'http://localhost:9228/shopify-permission';
const TASK_ID = process.env.ACCOMPLISH_TASK_ID;

type ShopifyOperationType = 'create' | 'update' | 'delete';
type ShopifyResourceType = 'product' | 'variant' | 'inventory';

interface PermissionDetails {
  title?: string;
  price?: string;
  productId?: number;
  variantId?: number;
  quantity?: number;
  status?: string;
}

/**
 * Request permission from the user before performing a Shopify write operation.
 * Returns true if allowed, false if denied.
 */
async function requestPermission(
  operation: ShopifyOperationType,
  resource: ShopifyResourceType,
  details: PermissionDetails
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const response = await fetch(SHOPIFY_PERMISSION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        operation, 
        resource, 
        details,
        taskId: TASK_ID, // Pass task ID to main process for correct routing
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[Shopify MCP] Permission API error:', errorData);
      // If permission API is not available, deny for safety
      return { allowed: false, error: errorData.error || 'Permission API unavailable' };
    }
    
    const data = await response.json();
    return { allowed: data.allowed === true };
  } catch (error) {
    // If permission API is not reachable, deny for safety
    console.error('[Shopify MCP] Permission API unreachable:', error);
    return { allowed: false, error: 'Permission API unreachable' };
  }
}

/**
 * Format operation label for user-friendly display
 */
function getOperationLabel(operation: ShopifyOperationType, resource: ShopifyResourceType): string {
  const opLabels: Record<ShopifyOperationType, string> = {
    create: 'creating',
    update: 'updating', 
    delete: 'deleting',
  };
  return `${opLabels[operation]} ${resource}`;
}

// ============================================================================
// Currency Helper
// ============================================================================

// Map of currency codes to symbols
const CURRENCY_SYMBOLS: Record<string, string> = {
  'INR': '₹',
  'USD': '$',
  'EUR': '€',
  'GBP': '£',
  'JPY': '¥',
  'CAD': 'CA$',
  'AUD': 'A$',
  'CNY': '¥',
  'KRW': '₩',
  'SGD': 'S$',
  'HKD': 'HK$',
  'MXN': 'MX$',
  'BRL': 'R$',
  'RUB': '₽',
  'CHF': 'CHF',
  'SEK': 'kr',
  'NOK': 'kr',
  'DKK': 'kr',
  'NZD': 'NZ$',
  'ZAR': 'R',
  'AED': 'د.إ',
  'SAR': '﷼',
  'THB': '฿',
  'MYR': 'RM',
  'PHP': '₱',
  'IDR': 'Rp',
  'VND': '₫',
  'PLN': 'zł',
  'TRY': '₺',
  'ILS': '₪',
  'COP': 'COL$',
  'ARS': 'AR$',
  'CLP': 'CLP$',
  'PEN': 'S/',
};

/**
 * Get currency symbol from currency code
 */
function getCurrencySymbol(currencyCode: string): string {
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode;
}

// Cached shop info (currency, etc.)
let cachedShopInfo: { currency: string; currencySymbol: string; name: string } | null = null;

/**
 * Get and cache shop context (currency, name, etc.)
 */
async function getShopContext(): Promise<{ currency: string; currencySymbol: string; name: string }> {
  if (cachedShopInfo) {
    return cachedShopInfo;
  }
  
  try {
    const result = await shopifyFetch<{ shop: { currency: string; name: string } }>('/shop.json');
    cachedShopInfo = {
      currency: result.shop.currency,
      currencySymbol: getCurrencySymbol(result.shop.currency),
      name: result.shop.name,
    };
    return cachedShopInfo;
  } catch (error) {
    // Default to INR if we can't fetch shop info
    console.error('[Shopify MCP] Failed to fetch shop info:', error);
    return { currency: 'INR', currencySymbol: '₹', name: 'Shop' };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

const tools: Tool[] = [
  {
    name: 'shopify_get_products',
    description: 'Get a list of products from the Shopify store. Returns product details including title, description, price, inventory, and images.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of products to return (default: 10, max: 250)',
        },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'draft'],
          description: 'Filter by product status',
        },
        product_type: {
          type: 'string',
          description: 'Filter by product type',
        },
        vendor: {
          type: 'string',
          description: 'Filter by vendor name',
        },
      },
    },
  },
  {
    name: 'shopify_get_product',
    description: 'Get detailed information about a specific product by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'number',
          description: 'The ID of the product to retrieve',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'shopify_search_products',
    description: 'Search for products by title.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to match against product titles',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'shopify_create_product',
    description: 'Create a new product in the Shopify store. Returns the created product with its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Product title (required)',
        },
        body_html: {
          type: 'string',
          description: 'Product description (HTML supported)',
        },
        vendor: {
          type: 'string',
          description: 'Product vendor/brand name',
        },
        product_type: {
          type: 'string',
          description: 'Product type/category (e.g., "T-Shirt", "Shoes")',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated list of tags',
        },
        status: {
          type: 'string',
          enum: ['active', 'draft'],
          description: 'Product status (default: draft)',
        },
        price: {
          type: 'string',
          description: 'Product price (e.g., "29.99")',
        },
        compare_at_price: {
          type: 'string',
          description: 'Compare at price for showing discounts',
        },
        sku: {
          type: 'string',
          description: 'SKU for the product variant',
        },
        image_url: {
          type: 'string',
          description: 'URL of the main product image',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'shopify_update_product',
    description: 'Update a product\'s details (title, description, tags, etc.). Use this to modify existing products.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'number',
          description: 'The ID of the product to update',
        },
        title: {
          type: 'string',
          description: 'New product title',
        },
        body_html: {
          type: 'string',
          description: 'New product description (HTML supported)',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated list of tags',
        },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'draft'],
          description: 'Product status',
        },
        product_type: {
          type: 'string',
          description: 'Product type/category',
        },
        vendor: {
          type: 'string',
          description: 'Product vendor',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'shopify_update_variant_price',
    description: 'Update a product variant\'s price. Use this to change pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        variant_id: {
          type: 'number',
          description: 'The ID of the variant to update',
        },
        price: {
          type: 'string',
          description: 'New price (e.g., "29.99")',
        },
        compare_at_price: {
          type: 'string',
          description: 'Compare at price for showing discounts (e.g., "39.99")',
        },
      },
      required: ['variant_id', 'price'],
    },
  },
  {
    name: 'shopify_get_orders',
    description: 'Get recent orders from the store. Returns order details including items, customer info, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of orders to return (default: 10)',
        },
        status: {
          type: 'string',
          enum: ['open', 'closed', 'cancelled', 'any'],
          description: 'Filter by order status',
        },
        financial_status: {
          type: 'string',
          enum: ['pending', 'authorized', 'paid', 'partially_paid', 'refunded', 'voided', 'partially_refunded'],
          description: 'Filter by payment status',
        },
        fulfillment_status: {
          type: 'string',
          enum: ['shipped', 'partial', 'unshipped', 'unfulfilled'],
          description: 'Filter by fulfillment status',
        },
      },
    },
  },
  {
    name: 'shopify_get_order',
    description: 'Get detailed information about a specific order.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'number',
          description: 'The ID of the order to retrieve',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'shopify_get_inventory',
    description: 'Get inventory levels for a product variant.',
    inputSchema: {
      type: 'object',
      properties: {
        inventory_item_id: {
          type: 'number',
          description: 'The inventory item ID (from variant.inventory_item_id)',
        },
      },
      required: ['inventory_item_id'],
    },
  },
  {
    name: 'shopify_set_inventory',
    description: 'Set the inventory quantity for a product at a location.',
    inputSchema: {
      type: 'object',
      properties: {
        inventory_item_id: {
          type: 'number',
          description: 'The inventory item ID',
        },
        location_id: {
          type: 'number',
          description: 'The location ID (get from shopify_get_locations)',
        },
        quantity: {
          type: 'number',
          description: 'The new inventory quantity',
        },
      },
      required: ['inventory_item_id', 'location_id', 'quantity'],
    },
  },
  {
    name: 'shopify_get_locations',
    description: 'Get all inventory locations for the store.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'shopify_add_product_image',
    description: 'Add an image to a product from a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'number',
          description: 'The ID of the product',
        },
        image_url: {
          type: 'string',
          description: 'URL of the image to add',
        },
        alt_text: {
          type: 'string',
          description: 'Alt text for the image (for accessibility)',
        },
      },
      required: ['product_id', 'image_url'],
    },
  },
  {
    name: 'shopify_get_shop',
    description: 'Get information about the connected Shopify store.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// Tool Handlers
// ============================================================================

async function handleToolCall(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'shopify_get_products': {
        const params = new URLSearchParams();
        if (args.limit) params.set('limit', String(args.limit));
        if (args.status) params.set('status', String(args.status));
        if (args.product_type) params.set('product_type', String(args.product_type));
        if (args.vendor) params.set('vendor', String(args.vendor));
        
        const query = params.toString();
        const [result, shopContext] = await Promise.all([
          shopifyFetch<{ products: ShopifyProduct[] }>(`/products.json${query ? `?${query}` : ''}`),
          getShopContext(),
        ]);
        
        // Simplify output for readability
        const simplified = result.products.map(p => ({
          id: p.id,
          title: p.title,
          status: p.status,
          vendor: p.vendor,
          product_type: p.product_type,
          tags: p.tags,
          price: p.variants[0]?.price,
          inventory: p.variants[0]?.inventory_quantity,
          image: p.images[0]?.src,
        }));
        
        return JSON.stringify({ 
          products: simplified, 
          count: simplified.length,
          currency: shopContext.currency,
          currencySymbol: shopContext.currencySymbol,
          note: `All prices are in ${shopContext.currency}. Use "${shopContext.currencySymbol}" symbol when displaying prices.`,
        }, null, 2);
      }

      case 'shopify_get_product': {
        const [result, shopContext] = await Promise.all([
          shopifyFetch<{ product: ShopifyProduct }>(`/products/${args.product_id}.json`),
          getShopContext(),
        ]);
        return JSON.stringify({
          ...result.product,
          currency: shopContext.currency,
          currencySymbol: shopContext.currencySymbol,
          note: `Prices are in ${shopContext.currency}. Use "${shopContext.currencySymbol}" symbol.`,
        }, null, 2);
      }

      case 'shopify_search_products': {
        const limit = args.limit || 10;
        const [result, shopContext] = await Promise.all([
          shopifyFetch<{ products: ShopifyProduct[] }>(`/products.json?title=${encodeURIComponent(String(args.query))}&limit=${limit}`),
          getShopContext(),
        ]);
        
        const simplified = result.products.map(p => ({
          id: p.id,
          title: p.title,
          price: p.variants[0]?.price,
          inventory: p.variants[0]?.inventory_quantity,
        }));
        
        return JSON.stringify({ 
          products: simplified, 
          count: simplified.length,
          currency: shopContext.currency,
          currencySymbol: shopContext.currencySymbol,
        }, null, 2);
      }

      case 'shopify_create_product': {
        // Request permission before creating product
        const permissionResult = await requestPermission('create', 'product', {
          title: String(args.title || ''),
          price: args.price ? String(args.price) : undefined,
          status: args.status ? String(args.status) : 'draft',
        });
        
        if (!permissionResult.allowed) {
          return JSON.stringify({
            error: `User rejected ${getOperationLabel('create', 'product')}: "${args.title}"`,
            denied: true,
          }, null, 2);
        }

        // Build product object
        const productData: Record<string, unknown> = {
          title: args.title,
          body_html: args.body_html || '',
          vendor: args.vendor || '',
          product_type: args.product_type || '',
          tags: args.tags || '',
          status: args.status || 'draft',
        };

        // Add variant with price if provided
        if (args.price || args.sku || args.compare_at_price) {
          productData.variants = [{
            price: args.price || '0.00',
            sku: args.sku || '',
            compare_at_price: args.compare_at_price || null,
            inventory_management: 'shopify',
          }];
        }

        // Add image if provided
        if (args.image_url) {
          productData.images = [{
            src: args.image_url,
          }];
        }

        const result = await shopifyFetch<{ product: ShopifyProduct }>(
          '/products.json',
          {
            method: 'POST',
            body: JSON.stringify({ product: productData }),
          }
        );

        return JSON.stringify({
          success: true,
          product: {
            id: result.product.id,
            title: result.product.title,
            status: result.product.status,
            variant_id: result.product.variants[0]?.id,
            inventory_item_id: (result.product.variants[0] as unknown as { inventory_item_id: number })?.inventory_item_id,
          },
        }, null, 2);
      }

      case 'shopify_update_product': {
        const { product_id, ...updates } = args;
        
        // Request permission before updating product
        const permissionResult = await requestPermission('update', 'product', {
          productId: Number(product_id),
          title: updates.title ? String(updates.title) : undefined,
          status: updates.status ? String(updates.status) : undefined,
        });
        
        if (!permissionResult.allowed) {
          return JSON.stringify({
            error: `User rejected ${getOperationLabel('update', 'product')}: ${updates.title || `ID ${product_id}`}`,
            denied: true,
          }, null, 2);
        }

        const result = await shopifyFetch<{ product: ShopifyProduct }>(
          `/products/${product_id}.json`,
          {
            method: 'PUT',
            body: JSON.stringify({ product: updates }),
          }
        );
        return JSON.stringify({ success: true, product: { id: result.product.id, title: result.product.title } }, null, 2);
      }

      case 'shopify_update_variant_price': {
        // Request permission before updating price
        const permissionResult = await requestPermission('update', 'variant', {
          variantId: Number(args.variant_id),
          price: args.price ? String(args.price) : undefined,
        });
        
        if (!permissionResult.allowed) {
          return JSON.stringify({
            error: `User rejected ${getOperationLabel('update', 'variant')} price to ${args.price}`,
            denied: true,
          }, null, 2);
        }

        const result = await shopifyFetch<{ variant: ShopifyVariant }>(
          `/variants/${args.variant_id}.json`,
          {
            method: 'PUT',
            body: JSON.stringify({
              variant: {
                price: args.price,
                compare_at_price: args.compare_at_price,
              },
            }),
          }
        );
        return JSON.stringify({ success: true, variant: { id: result.variant.id, price: result.variant.price } }, null, 2);
      }

      case 'shopify_get_orders': {
        const params = new URLSearchParams();
        if (args.limit) params.set('limit', String(args.limit));
        if (args.status) params.set('status', String(args.status));
        if (args.financial_status) params.set('financial_status', String(args.financial_status));
        if (args.fulfillment_status) params.set('fulfillment_status', String(args.fulfillment_status));
        
        const query = params.toString();
        const result = await shopifyFetch<{ orders: ShopifyOrder[] }>(
          `/orders.json${query ? `?${query}` : ''}`
        );
        
        const simplified = result.orders.map(o => ({
          id: o.id,
          name: o.name,
          email: o.email,
          total: o.total_price,
          status: o.financial_status,
          fulfillment: o.fulfillment_status,
          items: o.line_items.length,
          created: o.created_at,
        }));
        
        return JSON.stringify({ orders: simplified, count: simplified.length }, null, 2);
      }

      case 'shopify_get_order': {
        const result = await shopifyFetch<{ order: ShopifyOrder }>(
          `/orders/${args.order_id}.json`
        );
        return JSON.stringify(result.order, null, 2);
      }

      case 'shopify_get_inventory': {
        const result = await shopifyFetch<{ inventory_levels: Array<{ available: number; location_id: number }> }>(
          `/inventory_levels.json?inventory_item_ids=${args.inventory_item_id}`
        );
        return JSON.stringify(result.inventory_levels, null, 2);
      }

      case 'shopify_set_inventory': {
        // Request permission before setting inventory
        const permissionResult = await requestPermission('update', 'inventory', {
          quantity: Number(args.quantity),
        });
        
        if (!permissionResult.allowed) {
          return JSON.stringify({
            error: `User rejected ${getOperationLabel('update', 'inventory')} to ${args.quantity}`,
            denied: true,
          }, null, 2);
        }

        const result = await shopifyFetch<{ inventory_level: { available: number } }>(
          '/inventory_levels/set.json',
          {
            method: 'POST',
            body: JSON.stringify({
              location_id: args.location_id,
              inventory_item_id: args.inventory_item_id,
              available: args.quantity,
            }),
          }
        );
        return JSON.stringify({ success: true, available: result.inventory_level.available }, null, 2);
      }

      case 'shopify_get_locations': {
        const result = await shopifyFetch<{ locations: Array<{ id: number; name: string; active: boolean }> }>(
          '/locations.json'
        );
        return JSON.stringify(result.locations, null, 2);
      }

      case 'shopify_add_product_image': {
        const result = await shopifyFetch<{ image: ShopifyImage }>(
          `/products/${args.product_id}/images.json`,
          {
            method: 'POST',
            body: JSON.stringify({
              image: {
                src: args.image_url,
                alt: args.alt_text,
              },
            }),
          }
        );
        return JSON.stringify({ success: true, image: { id: result.image.id, src: result.image.src } }, null, 2);
      }

      case 'shopify_get_shop': {
        const result = await shopifyFetch<{ shop: { name: string; domain: string; email: string; currency: string; plan_name: string } }>(
          '/shop.json'
        );
        return JSON.stringify(result.shop, null, 2);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return JSON.stringify({ error: message }, null, 2);
  }
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  {
    name: 'shopify',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await handleToolCall(name, (args || {}) as Record<string, unknown>);
  
  return {
    content: [
      {
        type: 'text',
        text: result,
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Shopify MCP server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start Shopify MCP server:', error);
  process.exit(1);
});

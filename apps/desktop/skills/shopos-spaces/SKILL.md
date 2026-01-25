---
name: shopos-spaces
description: Guide for using ShopOS Space tools (space_*) for e-commerce image tasks like product swaps, style transfer, and background removal.
---

# ShopOS Spaces

ShopOS Spaces are specialized AI workflows for e-commerce image tasks. All space tools are prefixed with `space_` and available via MCP.

## Available Spaces

| Space | Purpose | Key Inputs |
|-------|---------|------------|
| space_product_swap | Place product into a new scene/background | product_image, reference_image |
| space_steal_the_look | Match editorial/lifestyle style | product_image, reference_image |
| space_sketch_to_product | Convert sketches to realistic renders | product_sketches |
| space_background_remover | Create transparent cutout (no background) | input_image |
| space_store_display_banner | Generate promotional banners/posters | product_images, user_query |
| space_multiproduct_tryon | Model wearing multiple products (GQ/Vogue editorial style) | product_images, reference_images?, custom_description? |

## When to Use Which Space

### space_product_swap
User wants to place a product into a scene:
- "Put [product] on [scene/location]"
- "Place product in front of [background]"
- "Change background to [location]"
- "Show product at [place]"
- "Swap the background"

### space_background_remover
User wants transparent cutout only (no new background):
- "Remove the background"
- "Isolate the product"
- "Create a cutout"
- "Transparent PNG"
- "No background"

### space_steal_the_look
User wants to match a style/aesthetic:
- "Make it look editorial"
- "Match this style"
- "Same vibe as [reference]"
- "Campaign style"
- "Fashion editorial look"

### space_sketch_to_product
User wants to visualize a design:
- "Turn this sketch into a product"
- "Render my design"
- "Visualize this concept"
- "Convert drawing to photo"

### space_store_display_banner
User wants promotional graphics:
- "Create a sale banner"
- "Make a promotional poster"
- "Store display graphic"
- "Marketing banner"
- "Campaign poster"

### space_multiproduct_tryon
User wants model wearing product(s) in editorial/lifestyle style:
- "Put this on a model"
- "Show a model wearing this"
- "Try on" / "tryon"
- "Create a lookbook shot"
- "Fashion editorial with this product"
- "GQ/Vogue style photo"
- "Lifestyle shot with model"
- "Put on Asian male model" (with custom description)

## Workflow

1. **Get image URLs** - Product image from Shopify or user-provided, reference image from web search if needed
2. **Select the appropriate space tool** based on what the user wants
3. **Call the space tool** with required inputs
4. **Communicate progress** - Space tools take 60-90 seconds, tell user what's happening
5. **Upload result** to Shopify if requested

## Technical Notes

- Space tools take 60-90 seconds to complete - this is normal
- URLs must be publicly accessible HTTPS URLs
- If a space fails, retry up to 3 times before trying alternatives
- Always tell the user what you're doing before calling a space tool
- Results are returned as URLs to generated images

## Examples

**User:** "Put my sneakers on a beach"
- Get product image URL (from Shopify or user)
- Search web for beach background image
- Call `space_product_swap` with product_image=sneaker URL, reference_image=beach URL

**User:** "Remove the background from this product photo"
- Call `space_background_remover` with input_image=product URL

**User:** "Make this product shot look like a Vogue editorial"
- Get product image URL
- Find Vogue editorial reference image
- Call `space_steal_the_look` with both images

**User:** "Create a 50% off sale banner for my store"
- Call `space_store_display_banner` with user_query="50% off sale" and optional product_images

**User:** "Put this t-shirt on an Asian male model in a coffee shop"
- Get product image URL
- Optionally find coffee shop reference image
- Call `space_multiproduct_tryon` with product_images=[t-shirt URL], custom_description="Asian male model in a coffee shop setting"

**User:** "Create a lookbook with these 3 products"
- Gather all product image URLs
- Call `space_multiproduct_tryon` with product_images=[url1, url2, url3]

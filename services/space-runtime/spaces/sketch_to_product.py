"""
Sketch to Product Workflow Implementation

This workflow transforms conceptual sketches into production-ready photorealistic 2K renders.
It uses OpenAI GPT-5.1 to analyze sketches and generate detailed prompts for product visualization,
and uses Gemini 3 Pro Image Preview to generate photorealistic renders.
"""
import traceback
import json
import asyncio
from typing import Dict, Any, Optional
from dataclasses import dataclass

from shared_libs.libs.logger import log
from shared_libs.libs.streaming import stream_progress, stream_image
from shared_libs.utils.chat_openai import chat_openai
from shared_libs.utils.image_gen import generate_image, AspectRatio, OutputFormat


# Simple message classes to replace langchain
@dataclass
class HumanMessage:
    content: Any
    type: str = "human"

@dataclass
class SystemMessage:
    content: str
    type: str = "system"


async def analyze_image_content(image_url: str) -> dict:
    """
    Analyze image to identify content for smart routing.

    Uses GPT-4o-mini with vision to determine what's in the image,
    enabling auto-correction when user mislabels images.
    """
    try:
        message_content = [
            {
                "type": "text",
                "text": "Describe this image in one concise sentence. Identify: type (logo/texture/pattern), main elements, colors. Format: 'Type: [X]. Contains: [Y]'"
            },
            {
                "type": "image_url",
                "image_url": {"url": image_url}
            }
        ]

        response = await chat_openai(
            messages=[HumanMessage(content=message_content)],
            model="gpt-4o-mini",
            temperature=0.2,
            timeout=45.0
        )

        description_content = response.content if hasattr(response, "content") else response
        if isinstance(description_content, list):
            description = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in description_content
            )
        else:
            description = str(description_content)

        # Parse type
        img_type = "unknown"
        description_lower = description.lower()
        if "logo" in description_lower or "brand" in description_lower:
            img_type = "logo"
        elif "texture" in description_lower or "fabric" in description_lower or "material" in description_lower:
            img_type = "texture"
        elif "pattern" in description_lower:
            img_type = "pattern"

        return {
            "description": description,
            "type": img_type
        }
    except Exception as e:
        log.error(f"Failed to analyze image {image_url}: {str(e)}")
        return {
            "description": "Image (analysis failed)",
            "type": "unknown"
        }


SKETCH_TO_PRODUCT_SYSTEM_PROMPT = """# SYSTEM PROMPT: Sketch-to-Product AI Agent



## Role

You are an expert product visualization AI that transforms conceptual sketches into production-ready photorealistic 2K renders. You understand industrial design, material science, photography techniques, fashion editorial standards, and visual merchandising across ALL product categories - from apparel and accessories to furniture, electronics, tools, and beyond. You apply 35mm film aesthetics and dynamic composition to create accurate product imagery.



**You are highly skilled at interpreting diverse reference materials.** When users upload additional images beyond the main sketch, you intelligently analyze each image to determine its purpose: material textures (leather, metal, fabric, wood, plastic, composites), surface finishes, logos and branding, patterns and prints, color references, or stylistic inspiration. You understand how to apply these references appropriately based on product type, design intent, and industry conventions.



You analyze each sketch to determine optimal viewing angles, poses, compositions, and backgrounds based on product category, key features, intended use, and industry standards. You make intelligent decisions about how to incorporate reference materials into renders, where to place graphics or branding, which materials apply to which components, and how to maintain consistency across multiple views while allowing view-specific variations.



**You excel at product-agnostic visualization** - whether it's a garment requiring editorial styling, furniture needing contextual interiors, electronics demanding clean product photography, or any other category, you adapt your approach to industry best practices while maintaining photorealistic quality and design accuracy.



## Core Rules



### User Specifications (MANDATORY)

- **Dimensions in sketch**: Follow EXACTLY

- **Materials specified**: Use EXACTLY as provided

- **Colors specified**: Match EXACTLY (HEX/RAL codes)

- **Details specified**: Include EXACTLY as described

- **Additional instructions**: Follow EXACTLY - highest priority for styling, context, presentation, and asset usage

- **Creative freedom**: ONLY when user hasn't specified



### Text and Branding

**CRITICAL**:

- Include product branding, logos, or text that are part of the product design

- EXCLUDE sketch metadata: artist signatures, dates, sketch notes, dimension annotations

- In Prompt 1, explicitly mention any branding/text for the product

- Do NOT transfer artist names, sketch dates, or annotations onto product



### Multi-Sketch Handling

When multiple sketches of same product:

- Apply SAME materials, colors, finishes, background, lighting across all

- For garments only: Use SAME model and styling



### Multiple Sketches in One Image

Generate separate renders for each sketch.



## Material Interpretation



**When specified:** Use EXACT material, research properties, apply realistic texture/finish



**When not specified:** Analyze sketch and product category to infer appropriate materials based on industry standards



**Categories** (non-exhaustive): Metals, Plastics/Polymers, Textiles/Fabrics, Natural Materials, Composites, Specialty finishes



## Additional Images Handling (Multi-Upload)



When additional images are uploaded beyond the main sketch, these serve as reference materials for the render. Additional images can include:

- **Material textures**: Leather, metal finishes, fabric weaves, wood grain, plastic surfaces, composites

- **Surface treatments**: Brushed, polished, matte, glossy, textured, patterned

- **Logos and branding**: Graphics to be placed on the product

- **Patterns and prints**: All-over patterns, localized designs, decorative elements

- **Color references**: Specific color swatches or examples

- **Inspiration images**: Style direction, mood, aesthetic references



### Intelligent Reference Interpretation



**When user provides specific instructions** (in additional_instructions):

- Follow EXACTLY how to use each image

- Example: "Use image 2 for the leather seat texture, image 3 for metal leg finish, image 4 logo on backrest"



**When NO specific instructions provided:**

Analyze each additional image (you'll receive descriptions) and apply intelligently based on product category and design conventions.

### How to Reference Images in Prompts

**CRITICAL RULE:** Use ONLY generic phrasing - let the image content drive generation:

✓ **Correct**: "Place the exact logo from Image 2 on center chest"
✓ **Correct**: "Use the exact material from Image 1 for seat upholstery"
✗ **Wrong**: "Use the Shop*S logo in full-color gradient from Image 2" (too descriptive)

**Fabric Integration for Logos/Graphics:**
- Logos must look printed/embroidered ON the fabric, not floating
- Show fabric texture through the graphic
- Include subtle shadows, wrinkles affecting the logo
- Think screen-print or embroidery, never cut-paste overlay



### View-Specific Asset Usage



**CRITICAL**: Different views may require different graphics or elements:

- Some assets apply to ALL views (materials, core colors, finishes)

- Some assets are VIEW-SPECIFIC (front logo, back pattern, side panel graphic)



**In prompts, explicitly control which assets appear in each view:**

- Prompt 1 (e.g., Front): "Include [specific assets for front view]"

- Prompt 2 (e.g., Back): "Using product above, generate back view. Include [back-specific assets]. Do NOT include [front-only assets]."

- This maintains consistency (material, color, background, lighting) while allowing view-specific variations



**Key Principle**: Additional images are materials and assets to be applied intelligently based on context, product type, and user instructions - not rigid prescriptive rules.



## Background and Environment



### Background Selection Principles:

- **Studio**: Clean, professional, minimal distractions, premium lighting - for commercial presentation

- **Lifestyle/Contextual**: Real-world environments where product naturally exists - for storytelling

- Analyze product category, target audience, color harmony

- Background supports but doesn't compete with product

- Match sophistication to product positioning



**Suggested approaches** (adapt intelligently):

- Premium appliances: High-end kitchen/modern interior

- Tech: Minimal desk, modern workspace, architectural space

- Fashion: Urban settings, minimal studio, natural landscapes

- Furniture: Styled interiors, architectural spaces

- Accessories: Lifestyle context, flat lays with complementary objects



Never use plain grey unless requested.



## Photography & Visual Quality Standards

**Camera & Optics:**
- 50mm lens for garments/close-ups, 35mm for full product shots
- Aperture: f/2.8–f/4 for shallow depth of field

**Film Aesthetic:**
- Kodak Portra 400 or Fuji Pro 400H color palette
- Natural grain, subtle not heavy
- True-to-life colors with slight desaturation
- **CRITICAL: NO yellow/orange/warm tint - daylight balanced (5500K)**

**Lighting:**
- Soft directional (large softbox or window light from camera left/right)
- Gentle shadows for depth, never flat catalog lighting
- High-key for apparel, dramatic side-light for hard goods

**Fashion/Apparel Poses:**
- Editorial dynamic: weight shifted, hand movement, natural gesture
- Avoid stiff catalog poses (arms straight at sides, deer-in-headlights)
- Think Vogue/GQ - relaxed confidence, not forced

**Backgrounds:**
- Minimal: light grey, off-white, concrete (never pure white seamless)
- Lifestyle: modern interiors, natural outdoor settings
- Use negative space for premium feel

**Composition:**
- Rule of thirds for lifestyle shots
- Tight crops for detail shots with breathing room
- Frame subject with negative space



## Two-Stage Generation Process



### Stage 1: Initial Render (Prompt 1)



**Input:** Sketch + user specifications + ALL additional images (if provided)



**Task:** Generate first primary view incorporating all relevant assets



**Hard Goods:**

```
**Prompt 1 (Initial Render from Sketch):**

Create a photorealistic 2K product render based on the uploaded sketch. [Product description]. Use [material] for primary surface. Apply [colors/accents]. [If additional images: "Use the exact material from Image [X] for [component]. Apply the exact pattern from Image [Y] to [area]. Place the exact graphic from Image [Z] on [placement] - ensure graphics integrate naturally with material (show surface texture, subtle shadows, not floating or cut-paste)."]. [If branding: "Include [branding/logo] on product"]. Set in [studio or lifestyle background]. Following Photography & Visual Quality Standards above. [If dimensions provided]. [Additional instructions]. Resolution: 2K (3840x2160).

```



**Garments:**

```
**Prompt 1 (Initial Render - Editorial Fashion):**

Create a photorealistic 2K editorial fashion photograph. [Garment description] worn by [model description]. Use [material/fabric] with [colors/details]. [If additional images: "Use the exact fabric from Image [X]. Place the exact logo from Image [Y] on [placement] - logo must look printed/embroidered with fabric texture showing through, subtle shadows, wrinkles affecting logo placement (not cut-paste overlay)."]. [If branding: "Include [branding] on garment"]. Model in [dynamic editorial pose] showing [view]. Background: [complementary environment]. Following Photography & Visual Quality Standards above. [If dimensions provided]. [Additional instructions]. Resolution: 2K (3840x2160).

```



### Stage 2: Additional Views (Prompt 2, 3, 4...)



**Input:** First generated image + view-specific instructions



**Task:** Generate alternative angles maintaining consistency, with explicit control over view-specific elements



**Hard Goods:**

```
**Prompt 2 ([View Type]):**

Using the product in the above image, generate [specific angle/view]. Maintain all materials, colors, finishes, details exactly. Keep same background and lighting. [If view has specific assets: "Place the exact graphic from Image [X] on [this view's placement] with natural integration (show surface texture, shadows). Do NOT include [element from different view]."]. Change only camera angle to show [view description]. Following Photography & Visual Quality Standards above. Resolution: 2K (3840x2160).

```



**Garments:**

```
**Prompt 2 ([View Type]):**

Using the garment and model in the above image, generate [view/pose] of same garment on SAME model. Maintain all materials, colors, finishes, details exactly. Keep same background and lighting. [If view has specific graphics: "Place the exact logo from Image [X] on [this view's area] - must look printed/embroidered with fabric texture showing. Do NOT include [front-only graphics]."]. Model in [new dynamic editorial pose] showcasing [view description]. Following Photography & Visual Quality Standards above. Resolution: 2K (3840x2160).

```



## Intelligent View Selection



Analyze each sketch individually based on:

1. Product category and design complexity

2. Key features to showcase

3. User intent from sketch

4. Industry photography standards



**Suggested angles** (adapt intelligently, not hard-coded):

- Hero/Primary angle

- Detail/Close-up (texture, craftsmanship)

- Top-down/Overhead

- Low angle/Bottom-up

- 3/4 angle

- Profile/Side view

- Back view

- In-context/Lifestyle

- Exploded/Deconstructed (complex products)



**Principles:**

- Hard goods: Hero angle, functionality reveals, scale/proportion, detail if intricate

- Garments: Poses showing fit/drape/silhouette, movement, construction details

- Furniture: Angles showing form, context, material quality, scale in space

- Electronics: Clean product angles, interface details, material finishes

- Think: What makes this unique? Which angles would a professional choose?



## Number of Variations

As many as user requests. Default: 5 (1 initial + 4 additional).



## Output Delivery



**1. Interpretation Summary:**

- Product category

- Key features

- Branding/text (if any)

- Dimensions (if provided)

- Materials and colors

- Additional images interpretation: [How each uploaded image was used - e.g., "Image 2 applied as leather texture for seat", "Image 3 used for metal leg finish", "Image 4 logo placed on front panel"]

- Background selected and why

- For garments: Model and editorial approach

- View strategy

- Number of views



**2. Prompt Set:**

For each prompt, return JSON in this exact format:

```json
{
  "prompt_1": {
    "prompt": "[Full detailed prompt text]",
    "negative_prompt": "[What to avoid]",
    "technical_parameters": "[Technical specifications]",
    "images_needed": [1, 2]
  },
  "prompt_2": {
    "prompt": "[Full detailed prompt text]",
    "negative_prompt": "[What to avoid]",
    "technical_parameters": "[Technical specifications]",
    "images_needed": [3]
  }
}
```

**CRITICAL - images_needed field:**

- This is an array of integers representing which additional image indices are needed for THIS specific prompt
- **Image indices are POSITIONAL: 1=first additional image, 2=second additional image, 3=third, etc. Use the order provided, NOT content analysis**
- Example: [1, 2] means this prompt needs Image 1 and Image 2
- Example: [3] means this prompt only needs Image 3
- Example: [] means no additional images needed for this prompt
- Do NOT include indices for images that should be excluded
- If no additional images were provided, omit this field or use []

**When to Include vs Omit Additional Images:**

✅ **Include in images_needed** if this variation:
- Shows NEW graphics not in reference (back logo, side panel art)
- Reveals different materials/textures (interior lining, alternate finish)
- Displays view-specific elements

❌ **Use images_needed: []** if this variation:
- Only shows DIFFERENT ANGLE of same product (3/4 vs straight-on)
- Is a CLOSE-UP of details already established
- Is a POSE CHANGE with same visible elements

**Example:**
- Var 1 (Front): [1, 2] - needs front + back logos
- Var 2 (Back): [2] - only back logo visible
- Var 3 (3/4 Front): [] - same as Var 1, just angle change
- Var 4 (Close-up): [] - zooming into Var 1

**Principle:** Only send additional images if that view introduces NEW visual elements not already in the reference image.
```



**3. Notes:** Assumptions made



## Quality Standards

- Photorealistic, production-ready across all product categories

- 35mm film aesthetic with professional lighting

- Exact adherence to specifications and additional instructions

- Intelligent interpretation and application of reference materials

- Contextual backgrounds that enhance product appeal

- Perfect consistency across views (material, color, lighting, background)

- View-specific asset control (explicit inclusion/exclusion per prompt)

- Adaptive view selection with varied angles

- Accurate branding (product only, not sketch metadata)

- Product-agnostic excellence - from fashion to furniture to electronics and beyond"""


async def _sketch_to_product_workflow(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sketch to product workflow implementation.
    
    Transforms conceptual sketches into production-ready photorealistic 2K renders using OpenAI analysis and Gemini image generation.
    Implements two-stage generation: Stage 1 uses sketches, Stage 2 uses first generated image as reference.
    
    Args:
        body: Request body dictionary containing:
            - product_sketch: List of URLs of sketch images that need to be transformed into photorealistic renders
            - additional_images: Optional list of URLs of reference images (logos, patterns, material textures, etc.)
            - core_material: Optional primary surface material or fabric for the product
            - accent_color: Optional color code (HEX/RAL) or specific feature detail for accents
            - dimensions: Optional product dimensions if not provided in sketch
            - additional_instructions: Optional text description of additional context or specific instructions
            - aspect_ratio: Aspect ratio string or enum for the output images (defaults to "1:1")
            - output_format: Output format string or enum (defaults to "jpeg")
            - num_variations: Number of variations to generate (defaults to 5)
    
    Returns:
        Dictionary matching the output schema with generated image URLs
    """
    log.info("Executing sketch to product workflow...")
    
    # Extract parameters from body
    product_sketch = body.get("product_sketches", [])
    additional_images = body.get("additional_images")
    additional_image_count = len(additional_images) if additional_images else 0
    core_material = body.get("core_material")
    accent_color = body.get("accent_color")
    dimensions = body.get("dimensions")
    additional_instructions = body.get("custom_description")
    
    # Handle aspect_ratio - convert string to enum if needed
    aspect_ratio_input = body.get("aspect_ratio", "1:1")
    if isinstance(aspect_ratio_input, str):
        aspect_ratio_map = {
            "1:1": AspectRatio.RATIO_1_1,
            "2:3": AspectRatio.RATIO_2_3,
            "3:2": AspectRatio.RATIO_3_2,
            "16:9": AspectRatio.RATIO_16_9,
            "9:16": AspectRatio.RATIO_9_16,
            "4:3": AspectRatio.RATIO_4_3,
            "3:4": AspectRatio.RATIO_3_4,
            "4:5": AspectRatio.RATIO_4_5,
            "5:4": AspectRatio.RATIO_5_4,
            "21:9": AspectRatio.RATIO_21_9,
        }
        aspect_ratio = aspect_ratio_map.get(aspect_ratio_input, AspectRatio.RATIO_1_1)
    elif isinstance(aspect_ratio_input, AspectRatio):
        aspect_ratio = aspect_ratio_input
    else:
        aspect_ratio = AspectRatio.RATIO_1_1
    
    # Handle output_format - convert string to enum if needed
    output_format_input = body.get("output_format", "jpeg")
    if isinstance(output_format_input, str):
        output_format_map = {
            "jpeg": OutputFormat.JPEG,
            "jpg": OutputFormat.JPG,
            "png": OutputFormat.PNG,
            "webp": OutputFormat.WEBP,
        }
        output_format = output_format_map.get(output_format_input.lower(), OutputFormat.JPEG)
    elif isinstance(output_format_input, OutputFormat):
        output_format = output_format_input
    else:
        output_format = OutputFormat.JPEG
    
    num_variations = body.get("num_variations", 5)
    
    # Validate required inputs
    if not product_sketch or not isinstance(product_sketch, list) or len(product_sketch) == 0:
        log.error("Missing required parameter: product_sketch")
        return {
            "success": False,
            "error": "Missing required parameter 'product_sketch' (must be a non-empty array)",
            "outputAssets": []
        }
    
    log.info(f"Sketch to product workflow - Product sketches: {product_sketch}, Additional images: {additional_images}, Core material: {core_material}, Accent color: {accent_color}, Dimensions: {dimensions}, Additional instructions: {additional_instructions}, Num variations: {num_variations}, Aspect ratio: {aspect_ratio}")
    
    stream_progress(id="analyze-request", status="completed", wait_for=15)

    try:
        # Step 1: OpenAI GPT-5.1 Analysis & Prompt Generation

        log.info(f"Step 1: Calling OpenAI GPT-5.1 to generate {num_variations} sketch-to-product prompt(s)...")
        
        # Build comprehensive user message with all specifications
        user_message_content = "Analyze the sketch image(s) to generate photorealistic 2K render prompt(s).\n\n"
        
        # Add user specifications
        user_message_content += "User Specifications:\n"
        if core_material:
            user_message_content += f"- Material: {core_material}\n"
        else:
            user_message_content += "- Material: AI will infer appropriate material\n"
        
        if accent_color:
            user_message_content += f"- Accent Color: {accent_color}\n"
        else:
            user_message_content += "- Accent Color: AI will use complementary colors\n"
        
        if dimensions:
            user_message_content += f"- Dimensions: {dimensions}\n"
        else:
            user_message_content += "- Dimensions: Follow dimensions in sketch\n"
        
        if additional_instructions:
            user_message_content += f"- Additional Instructions: {additional_instructions}\n"
        
        if additional_image_count > 0:
            user_message_content += f"- Additional Images: {additional_image_count} reference image(s) provided\n"
        
        # Handle multiple sketches
        if len(product_sketch) > 1:
            user_message_content += f"\nMultiple sketches of the same product provided ({len(product_sketch)} sketches). Apply SAME materials, colors, finishes across all views.\n"
        
        # Add generation instructions
        user_message_content += f"\nGenerate {num_variations} prompts following the two-stage process. Return your response as valid JSON:\n"
        user_message_content += "- Prompt 1: Initial render from sketch\n"
        if num_variations > 1:
            user_message_content += f"- Prompts 2-{num_variations}: Additional views using first generated image as reference\n"
        user_message_content += "\nFormat your response as JSON with prompt_1, prompt_2, etc. blocks as specified in the system prompt.\n"
        
        # Format message with images for vision API - include all sketches
        message_content = [
            {
                "type": "text",
                "text": user_message_content
            }
        ]
        
        # Add all sketch images to the message
        for sketch_url in product_sketch:
            message_content.append({
                "type": "image_url",
                "image_url": {
                    "url": sketch_url
                }
            })
        
        # Add all additional images with indexing for OpenAI reference
        if additional_image_count > 0:
            # Analyze each image to identify content for smart routing
            log.info("Analyzing additional images for content...")
            analyzed_images = []

            for idx, img_url in enumerate(additional_images):
                try:
                    analysis = await analyze_image_content(img_url)
                    analyzed_images.append({
                        "position": idx + 1,
                        "url": img_url,
                        "description": analysis["description"],
                        "type": analysis["type"]
                    })
                    log.info(f"Image {idx + 1} ({analysis['type']}): {analysis['description']}")
                except Exception as e:
                    log.error(f"Failed to analyze image {idx + 1}: {str(e)}")
                    analyzed_images.append({
                        "position": idx + 1,
                        "url": img_url,
                        "description": "Image (analysis failed)",
                        "type": "unknown"
                    })

            # Build message with analyzed descriptions
            additional_images_text = f"\n{len(analyzed_images)} additional images provided:\n"
            for img in analyzed_images:
                additional_images_text += f"- Image {img['position']}: {img['description']}\n"

            additional_images_text += """
IMPORTANT IMAGE REFERENCE RULES:
- Image numbers are POSITIONAL (Image 1 = first image, Image 2 = second, etc.)
- In your prompts, reference images ONLY as: "the exact [logo/texture/pattern] from Image X"
- NEVER describe the content (e.g., don't say "Shop*S logo in gradient form")
- Let the actual image content drive the generation
- If user instructions reference content that doesn't match a position (e.g., "Puma from Image 1" but Image 1 contains Shop*S), use the image at the CORRECT position that matches the content requested
- Include 'images_needed' array for each prompt specifying which image indices are required
"""
            
            # Insert this text into the user message
            message_content[0]["text"] += additional_images_text
            
            # Add the actual images
            for img_url in additional_images:
                message_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": img_url
                    }
                })
        
        messages = [
            SystemMessage(content=SKETCH_TO_PRODUCT_SYSTEM_PROMPT),
            HumanMessage(content=message_content)
        ]
        
        # Call OpenAI via shared chat utility
        print("[DEBUG] Calling chat_openai...", flush=True)
        try:
            response = await chat_openai(
                messages=messages,
                model="gpt-5.1",
                temperature=0.7,
                timeout=120.0
            )
            print(f"[DEBUG] chat_openai returned: type={type(response)}, has_content={hasattr(response, 'content')}", flush=True)
        except Exception as e:
            print(f"[DEBUG] chat_openai raised exception: {str(e)}", flush=True)
            log.error(f"chat_openai raised exception: {str(e)}")
            raise
        
        # Extract and parse JSON response
        ai_response_content = response.content if hasattr(response, "content") else response
        print(f"[DEBUG] ai_response_content type: {type(ai_response_content)}, len: {len(str(ai_response_content)) if ai_response_content else 0}", flush=True)
        print(f"[DEBUG] ai_response_content value (first 500): {str(ai_response_content)[:500]}", flush=True)
        if isinstance(ai_response_content, list):
            ai_response = "".join(
                part.get("text", "") if isinstance(part, dict) else str(part)
                for part in ai_response_content
            )
        else:
            ai_response = str(ai_response_content)
        
        # Strip markdown code fences if present (OpenAI sometimes wraps JSON in ```json ... ```)
        ai_response = ai_response.strip()
        if ai_response.startswith("```json"):
            ai_response = ai_response[7:]  # Remove ```json
        if ai_response.startswith("```"):
            ai_response = ai_response[3:]  # Remove ```
        if ai_response.endswith("```"):
            ai_response = ai_response[:-3]  # Remove trailing ```
        ai_response = ai_response.strip()
        
        log.info(f"OpenAI response received: {ai_response[:200]}...")
        
        try:
            response_data = json.loads(ai_response)

            # LOGGING: Show full OpenAI response
            log.info("=" * 80)
            log.info("📋 OPENAI FULL RESPONSE:")
            log.info(json.dumps(response_data, indent=2))
            log.info("=" * 80)

        except json.JSONDecodeError as e:
            log.error(f"Failed to parse OpenAI JSON response: {str(e)}")
            return {
                "success": False,
                "error": f"Failed to parse OpenAI response as JSON: {str(e)}",
                "outputAssets": []
            }
        
        # Parse variations from numbered prompt blocks (prompt_1, prompt_2, etc.)
        variations = []
        
        for i in range(1, num_variations + 1):
            prompt_key = f"prompt_{i}"
            prompt_block = response_data.get(prompt_key, {})
            
            # Check if it's the new nested format
            if isinstance(prompt_block, dict):
                prompt_text = prompt_block.get("prompt", "")
                negative_prompt = prompt_block.get("negative_prompt", "")
                technical_parameters = prompt_block.get("technical_parameters", "")
                images_needed = prompt_block.get("images_needed", [])
            else:
                # Backward compatibility: check old flat format
                if i == 1:
                    # Try old format for first variation
                    prompt_text = response_data.get("prompt", "")
                    if prompt_text:
                        variations.append({
                            "variation_number": 1,
                            "focus_area": "Initial render from sketch",
                            "prompt": prompt_text,
                            "negative_prompt": response_data.get("negative_prompt", ""),
                            "technical_parameters": response_data.get("technical_parameters", ""),
                            "images_needed": []  # Old format doesn't have images_needed
                        })
                        break
                
                # Try old numbered format
                prompt_text = response_data.get(f"prompt_{i}", "")
                negative_prompt = response_data.get(f"negative_prompt_{i}", "")
                technical_parameters = response_data.get(f"technical_parameters_{i}", "")
                images_needed = []  # Old format doesn't have images_needed
            
            if not prompt_text:
                if i == 1:
                    log.error(f"OpenAI returned no prompt_1 block")
                    return {
                        "success": False,
                        "error": f"OpenAI returned no prompt for variation {i}",
                        "outputAssets": []
                    }
                else:
                    log.warning(f"OpenAI returned no prompt_{i} block, stopping at {len(variations)} variations")
                    break
            
            variations.append({
                "variation_number": i,
                "focus_area": f"Variation {i} render",
                "prompt": prompt_text,
                "negative_prompt": negative_prompt,
                "technical_parameters": technical_parameters,
                "images_needed": images_needed
            })
        
        if len(variations) == 0:
            log.error("OpenAI returned no valid prompts")
            return {
                "success": False,
                "error": "OpenAI returned no valid prompts",
                "outputAssets": []
            }
        
        if len(variations) < num_variations:
            log.warning(f"OpenAI returned {len(variations)} variation(s), expected {num_variations}. Using available variations.")
        
        log.info(f"Step 1 completed: Generated {len(variations)} sketch-to-product prompt(s)")

        stream_progress(id="plan-materials", status="completed")
        
        # Step 2: Generate photorealistic renders using two-stage process
        log.info(f"Step 2: Generating {len(variations)} photorealistic render(s) using Gemini...")
        
        output_assets = []
        images_generated = 0
        errors = []
        first_generated_image_url = None
                
        def normalize_images_needed(variation_num: int, images_needed: Any) -> list[int]:
            if not images_needed:
                return []
            if not isinstance(images_needed, list):
                log.warning(f"Variation {variation_num}: images_needed is not a list: {images_needed}, treating as empty")
                return []
            valid_images_needed = []
            for idx in images_needed:
                if isinstance(idx, (int, float)) and 1 <= int(idx) <= additional_image_count:
                    valid_images_needed.append(int(idx))
                else:
                    log.warning(f"Variation {variation_num}: Invalid image index {idx} (type: {type(idx).__name__}), skipping")
            return valid_images_needed

        async def run_variation(variation: Dict[str, Any], stage1_url: Optional[str]) -> tuple[Optional[dict], Optional[str]]:
            variation_num = variation.get("variation_number")
            focus_area = variation.get("focus_area", f"Variation {variation_num}")
            prompt_text = variation.get("prompt", "")
            negative_prompt = variation.get("negative_prompt", "")
            technical_parameters = variation.get("technical_parameters", "")
            images_needed = normalize_images_needed(variation_num, variation.get("images_needed", []))

            log.info("=" * 80)
            log.info(f"📸 Variation {variation_num}: images_needed = {images_needed}")
            log.info(f"   Focus: {focus_area}")
            if images_needed and additional_images:
                log.info(f"   Requested images: {[f'Image {idx}' for idx in images_needed]}")

            if not prompt_text:
                return None, f"Variation {variation_num}: No prompt generated"

            if variation_num == 1:
                images = [{"url": url, "name": "sketch"} for url in product_sketch]
                if additional_image_count > 0 and images_needed:
                    for img_idx in images_needed:
                        if 1 <= img_idx <= additional_image_count:
                            images.append({"url": additional_images[img_idx - 1], "name": f"reference_image_{img_idx}"})
                        else:
                            log.warning(f"Image {img_idx} referenced but only {additional_image_count} additional images provided")
                log.info(f"Stage 1: Generating initial render from sketch(es) + {len(images_needed) if images_needed else 0} additional image(s) - Variation {variation_num}: {focus_area}")
            else:
                if not stage1_url:
                    return None, f"Variation {variation_num}: First image not available for Stage 2 generation"
                images = [{"url": stage1_url, "name": "stage1_reference"}]
                if additional_image_count > 0 and images_needed:
                    for img_idx in images_needed:
                        if 1 <= img_idx <= additional_image_count:
                            images.append({"url": additional_images[img_idx - 1], "name": f"reference_image_{img_idx}"})
                        else:
                            log.warning(f"Image {img_idx} referenced but only {additional_image_count} additional images provided")
                log.info(f"Stage 2: Generating view from first image + {len(images_needed) if images_needed else 0} additional image(s) - Variation {variation_num}: {focus_area}")

            log.info(f"   📦 Total images being sent to Gemini: {len(images)}")
            for img_dict in images:
                img_url = img_dict.get("url", "")
                img_label = img_dict.get("name", "image")
                img_name = img_url.split('/')[-1].split('?')[0][:50] if img_url else "unknown"
                log.info(f"      - {img_label}: {img_name}")

            combined_prompt = f"{prompt_text}, {technical_parameters}"
            if negative_prompt:
                combined_prompt = f"{combined_prompt}. Avoid: {negative_prompt}"

            result = await generate_image(
                prompt=combined_prompt,
                images=images,
                tag="sketch-to-product",
                aspect_ratio=aspect_ratio,
                output_format=output_format,
            )

            if "error" in result:
                error_msg = f"Variation {variation_num}: {result.get('error')}"
                log.error(f"Image generation failed - {error_msg}")
                return None, error_msg

            if "url" not in result or not result.get("url"):
                meta_error = result.get("metadata", {}).get("error")
                error_msg = f"Variation {variation_num}: No image URL returned{f' - {meta_error}' if meta_error else ''}"
                log.error(error_msg)
                return None, error_msg

            asset = {
                "type": "image",
                "url": result["url"],
            }
            return asset, None

        # Run Stage 1 synchronously to obtain the reference image
        stage1_variation = next((v for v in variations if v.get("variation_number") == 1), None)
        if stage1_variation:
            asset, error = await run_variation(stage1_variation, None)
            if error:
                errors.append(error)
            if asset:
                first_generated_image_url = asset["url"]
                output_assets.append(asset)
                stream_image(first_generated_image_url, "First shot")
                stream_progress(id="generate-hero-visual", status="completed")
                images_generated += 1
                log.info(f"Stage 1 completed: First image generated at {first_generated_image_url}")
        else:
            errors.append("No variation 1 found; cannot proceed with additional views.")

        # Run remaining variations concurrently using the Stage 1 image

        remaining_variations = [v for v in variations if v.get("variation_number") != 1]
        if remaining_variations and first_generated_image_url:
            tasks = [asyncio.create_task(run_variation(variation, first_generated_image_url)) for variation in remaining_variations]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in results:
                if isinstance(res, Exception):
                    log.error("Variation generation failed with exception", exc_info=True)
                    errors.append(str(res))
                    continue
                asset, error = res
                if error:
                    errors.append(error)
                if asset:
                    output_assets.append(asset)
                    images_generated += 1
                    if asset.get("url"):
                        label = f"Variation {images_generated}"
                        stream_image(asset["url"], label)
        elif remaining_variations:
            log.error("Skipping Stage 2 variations because Stage 1 image was not generated")
            errors.append("Stage 1 image missing; Stage 2 variations skipped")
        
        # Format response to match output schema
        if images_generated == 0:
            error_message = f"All image generations failed. {'; '.join(errors)}" if errors else "No images generated"
            log.error(error_message)
            return {
                "success": False,
                "error": error_message,
                "outputAssets": []
            }
        
        log.info(f"Sketch to product workflow completed: {images_generated} image(s) generated successfully")
        stream_progress(id="generate-additional-visuals", status="completed")
        return {
            "success": True,
            "outputAssets": output_assets
        }
        
    except Exception as e:
        log.critical(f"Error in sketch to product workflow: {str(e)}\n{traceback.format_exc()}", usecase="sketch_to_product")
        return {
            "success": False,
            "error": str(e),
            "outputAssets": []
        }


def execute_sketch_to_product_workflow(body: dict):
    """
    Execute sketch to product workflow.
    """
    return asyncio.run(_sketch_to_product_workflow(body=body))


"""
Product Swap Workflow Implementation

This workflow swaps products between different backgrounds or contexts.

It uses Gemini 2.5 Pro to analyze the product and reference images and generate detailed prompts,
then uses Gemini image generation to create swapped product images.
"""
import asyncio
import json
from typing import Dict, Any, Optional
from shared_libs.libs.logger import log
from shared_libs.utils.image_gen import generate_image, AspectRatio, OutputFormat
from shared_libs.utils.chat_gemini import chat_gemini
from shared_libs.libs.streaming import stream_progress, stream_image

PRODUCT_SWAP_SYSTEM_PROMPT = """# ROLE

You are an expert AI image composition specialist for photorealistic product placement.

# TASK

Generate {num_variations} detailed prompts that will extract a product from one image and place it naturally into another scene.

# CRITICAL DIRECTION RULE ⚠️

- **Image 1 (PRODUCT IMAGE)**: Extract the product FROM this image

- **Image 2 (REFERENCE IMAGE)**: Place the product INTO this scene/environment

- ALWAYS extract from Image 1 → Place into Image 2

- NEVER reverse this direction

# MODES

**AUTO MODE (No additional instructions):**

- Swap product ONLY

- Preserve everything else: people, backgrounds, lighting, composition, text

**CUSTOM MODE (Additional instructions provided):**

- Swap product (primary goal)

- Apply the additional instructions to ALL {num_variations} variations

- Additional instructions override preservation rules for mentioned elements

{additional_instructions_section}

# ANALYSIS PROCESS

**Step 1: Product Analysis (Image 1 - Product Image)**

- Identify: product type, color, material, texture, branding

- Note: patterns, design elements, style

- Remember: Extract ONLY the product, no background

**Step 2: Scene Analysis (Image 2 - Reference Image)**

- Identify: environment type, existing products (if any)

- Note: lighting (direction, color, intensity), perspective, composition

- Note: people, props, text, surfaces to preserve

- Determine: WHERE the product should be placed

**Step 3: Integration Planning**

- How to naturally place Image 1 product into Image 2 scene

- What to replace in Image 2 (if anything)

- How to match scale, perspective, lighting

- What must be preserved from Image 2

# PROMPT TEMPLATE

Generate prompts following this EXACT structure:

---

You are provided with two images:

1. A product image showing [PRODUCT DESCRIPTION FROM IMAGE 1]

2. A reference image showing [SCENE DESCRIPTION FROM IMAGE 2]

TASK: Extract the [PRODUCT TYPE] from the product image (Image 1) and place it into the scene from the reference image (Image 2), replacing [WHAT TO REPLACE IN IMAGE 2, IF ANYTHING].

PRODUCT EXTRACTION:

- Extract ONLY the [PRODUCT TYPE] itself from Image 1

- NO background, mannequins, packaging, or props from the product image

- Product features: [KEY FEATURES - color, texture, branding, etc.]

SCENE INTEGRATION (Image 2 - Reference Image):

- Place the product [POSITION DESCRIPTION]

- Match the lighting: [LIGHTING DETAILS FROM IMAGE 2]

- Match the perspective: [PERSPECTIVE/ANGLE FROM IMAGE 2]

- Match scale appropriately to fit naturally

PRESERVE FROM IMAGE 2 (Reference Image):

- People/models: EXACT same person, face, pose, positioning (unless additional instructions specify changes)

- Environment: [LIST 2-3 KEY ELEMENTS]

- Text/signage: Keep all text elements unchanged

- Composition: Maintain overall framing and layout

{additional_instructions_placeholder}

QUALITY REQUIREMENTS:

- 8k resolution, photorealistic

- Sharp focus, detailed textures

- Natural lighting and shadows

- Seamless integration as if product was always in the scene

- No watermarks, artifacts, distortion, or blurriness

---

# TEMPLATE FILLING GUIDE

Based on your analysis, fill these placeholders:

- **[PRODUCT DESCRIPTION FROM IMAGE 1]**: Describe the product in the product image

- **[SCENE DESCRIPTION FROM IMAGE 2]**: Describe the environment in the reference image

- **[PRODUCT TYPE]**: Simple product category

- **[WHAT TO REPLACE IN IMAGE 2]**: What item to replace or where to position

- **[POSITION DESCRIPTION]**: Where/how the product should be placed

- **[LIGHTING DETAILS]**: Lighting characteristics from reference image

- **[PERSPECTIVE/ANGLE]**: Camera angle from reference image

- **[LIST 2-3 KEY ELEMENTS]**: Key environmental elements to preserve

- **{additional_instructions_placeholder}**: If additional instructions provided, insert: "ADDITIONAL INSTRUCTIONS:\n[instructions]"

# CRITICAL RULES

1. **Direction**: ALWAYS extract from Image 1 (product image) → place into Image 2 (reference image)

2. **Extraction**: Product ONLY, no background elements from Image 1

3. **Preservation**: Keep all Image 2 elements unless additional instructions say otherwise

4. **No Hallucination**: Use ONLY visible product features, don't invent details

5. **Output**: Valid JSON with EXACTLY {num_variations} prompts

# OUTPUT FORMAT

Return ONLY raw JSON (no markdown, no fences):

{{
  "swap_prompts": [
    {{
      "description": "Brief swap description",
      "prompt": "[Complete prompt following template above]"
    }}
  ]
}}

Number of prompts MUST equal {num_variations}.
"""

def _dummy_function(text: str):
    log.debug("Dummy function call")
    return text

async def product_swap_workflow(
    product_image: str,
    reference_image: str,
    additional_instructions: Optional[str] = None,
    aspect_ratio: AspectRatio = AspectRatio.RATIO_1_1,
    output_format: OutputFormat = OutputFormat.JPEG,
    num_variations: int = 2,
) -> Dict[str, Any]:
    """
    Product swap workflow implementation.
    
    Generates swapped product images using Gemini analysis and image generation.
    
    Args:
        product_image: URL of the product image (Image 1 - extract product from this)
        reference_image: URL of the reference image (Image 2 - place product into this)
        additional_instructions: Optional additional instructions for the swap (applied to all variations)
        aspect_ratio: Aspect ratio enum for the output images
        output_format: Output format enum (defaults to JPEG)
        num_variations: Number of variations to generate (default: 2)
    
    Returns:
        Dictionary matching the output schema with generated image URLs
    """
    log.info("Executing product swap workflow...")

    
    # Validate required inputs
    if not product_image:
        log.error("Missing required parameter: product_image")
        return {
            "metadata": {
                "workflow": "product_swap",
                "images_generated": 0,
                "message": "Error: Missing required parameter 'product_image'"
            },
            "outputAssets": []
        }
    
    if not reference_image:
        log.error("Missing required parameter: reference_image")
        return {
            "metadata": {
                "workflow": "product_swap",
                "images_generated": 0,
                "message": "Error: Missing required parameter 'reference_image'"
            },
            "outputAssets": []
        }
    
    log.info(f"Product swap workflow - Product image: {product_image}, Reference image: {reference_image}, Additional instructions: {additional_instructions}, Aspect ratio: {aspect_ratio}")
    
    if additional_instructions:
        log.info(f"Running in CUSTOM MODE with instructions: {additional_instructions[:100]}...")
    else:
        log.info("Running in AUTO MODE - product swap only")

    stream_progress(id="analyze-request", status="completed", wait_for=15)
    
    try:
        # Step 1: Gemini Analysis & Prompt Generation
        log.info("Step 1: Calling Gemini to generate swap prompts...")
        
        # Build additional instructions section for system prompt
        if additional_instructions:
            additional_instructions_section = f"""ADDITIONAL INSTRUCTIONS FOR THIS WORKFLOW:
{additional_instructions}

These instructions MUST be applied to ALL {num_variations} variations and override preservation rules for elements they mention."""
            additional_instructions_placeholder = f"ADDITIONAL INSTRUCTIONS:\n{additional_instructions}\n\nThese instructions must be applied exactly as specified."
        else:
            additional_instructions_section = ""
            additional_instructions_placeholder = ""
        
        # Format system prompt with all placeholders
        system_prompt_content = PRODUCT_SWAP_SYSTEM_PROMPT.format(
            num_variations=num_variations,
            additional_instructions_section=additional_instructions_section,
            additional_instructions_placeholder=additional_instructions_placeholder
        )
        
        # Build user message with clear image labels
        user_message_content = [
            {
                "type": "text",
                "text": "Analyze the following images:\n\nImage 1 (PRODUCT IMAGE): Extract the product from this image\nImage 2 (REFERENCE IMAGE): Place the product into this scene"
            },
        ]

        # Add images in correct order: Image 1 (product) first, Image 2 (reference) second
        if product_image:
            user_message_content.append({
                "type": "text",
                "text": "Image 1 (PRODUCT IMAGE):"
            })
            user_message_content.append({
                "type": "image_url",
                "image_url": {
                    "url": product_image
                }
            })
        if reference_image:
            user_message_content.append({
                "type": "text",
                "text": "Image 2 (REFERENCE IMAGE):"
            })
            user_message_content.append({
                "type": "image_url",
                "image_url": {
                    "url": reference_image
                }
            })
        
        # Format message with images for vision API
        messages = [
            {
                "role": "system",
                "content": system_prompt_content
            },
            {
                "role": "user",
                "content": user_message_content
            }
        ]
        
        # Call OpenAI API
        response = await chat_gemini(
            messages=messages,
            model="gemini-2.5-pro",
            temperature=0.2,
            timeout=120
        )

        print("\n\n", response,"\n\n")
        
        # Extract and parse JSON response
        ai_response = getattr(response, "content", str(response))
        log.info(f"Gemini response received: {ai_response[:200]}...")

        def _safe_parse_json(raw_response: Any) -> Optional[Dict[str, Any]]:
            """Best-effort JSON extraction to handle prefixed or fenced payloads."""
            if raw_response is None:
                return None

            text = raw_response if isinstance(raw_response, str) else str(raw_response)
            text = text.strip()

            # Strip leading "json" markers or code fences
            if text.lower().startswith("json"):
                text = text[4:].strip()

            if text.startswith("```json"):
                text = text[len("```json"):].strip()
            elif text.startswith("```"):
                text = text[3:].strip()
            if text.endswith("```"):
                text = text[:-3].strip()

            # Extract first JSON object block if extra text is present
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                text = text[start:end + 1]

            try:
                return json.loads(text)
            except json.JSONDecodeError as e:
                log.error(f"Failed to parse Gemini JSON response after cleaning: {str(e)} | snippet: {text[:200]}")
                return None
        
        response_data = _safe_parse_json(ai_response)
        if not response_data:
            return {
                "metadata": {
                    "workflow": "product_swap",
                    "images_generated": 0,
                    "message": "Error: Failed to parse Gemini response as JSON"
                },
                "outputAssets": []
            }

        swap_prompts = response_data.get("swap_prompts", [])
        
        if not swap_prompts:
            log.error("Gemini returned no prompts")
            return {
                "metadata": {
                    "workflow": "product_swap",
                    "images_generated": 0,
                    "message": "Error: Gemini returned no prompts"
                },
                "outputAssets": []
            }

        # Validate prompt count matches requested variations
        if len(swap_prompts) != num_variations:
            log.warning(f"Expected {num_variations} prompts but got {len(swap_prompts)}. Using available prompts.")
            if len(swap_prompts) == 0:
                return {
                    "metadata": {
                        "workflow": "product_swap",
                        "images_generated": 0,
                        "message": f"Error: Expected {num_variations} prompts but got 0"
                    },
                    "outputAssets": []
                }

        print("\n\n", swap_prompts,"\n\n")
        
        log.info(f"Step 1 completed: Generated {len(swap_prompts)} prompt(s) (requested: {num_variations})")
        stream_progress(id="plan-placement", status="completed")
        
        # Verify additional instructions are included in prompts if provided
        if additional_instructions:
            for i, prompt_data in enumerate(swap_prompts):
                prompt_text = prompt_data.get("prompt", "")
                if additional_instructions.lower() not in prompt_text.lower():
                    log.warning(f"Prompt {i+1} may not include additional instructions. Verifying...")
        
        # Step 2: Generate images for each prompt concurrently
        log.info(f"Step 2: Generating {len(swap_prompts)} swapped product images concurrently with Gemini...")
        
        async def _generate_single_swap_image(
            prompt_data: Dict[str, str],
            index: int
        ) -> Optional[Dict[str, Any]]:
            """Generate a single swap image with error handling."""
            description = prompt_data.get("description", "")
            prompt_text = prompt_data.get("prompt", "")
            
            # Prompt already includes additional instructions from system prompt template
            log.info(f"Generating product swap image {index} - Description: {description}")
            
            try:
                # Format images as list of dicts expected by generate_image
                images = [{"url": product_image, "name": "product"}]

                if reference_image:
                    images.append({"url": reference_image, "name": "reference"})
                
                # Call generate_image function
                result = await generate_image(
                    prompt=prompt_text,
                    images=images,
                    tag=f"product-swap-v{index}",
                    aspect_ratio=aspect_ratio,
                    output_format=output_format
                )

                _dummy_function("testing after each variations generation")
                
                # Check if generation was successful
                if "error" in result:
                    log.error(f"Image generation {index} failed: {result.get('error')}")
                    return None
                
                log.info(f"Product swap image {index} generated successfully: {result.get('url')}")
                
                return {
                    "type": "image",
                    "url": result["url"],
                    "metadata": {
                        "tag": result.get("tag", "product-swap"),
                        "id": result.get("id"),
                        "source": result.get("source", "Nano 🍌")
                    }
                }
            except Exception as e:
                log.error(f"Exception during image generation {index}: {str(e)}", exc_info=True)
                return None
        
        # Create concurrent generation tasks
        generation_tasks = [
            _generate_single_swap_image(prompt_data, i)
            for i, prompt_data in enumerate(swap_prompts, 1)
        ]
        
        
        # Execute all generations concurrently
        # return_exceptions=True ensures one failure doesn't stop others
        generation_results = await asyncio.gather(*generation_tasks, return_exceptions=True)

        _dummy_function("testing after all variations generation")
        
        # Process results and collect successful images
        output_assets = []
        for i, result in enumerate(generation_results, 1):
            if isinstance(result, Exception):
                log.error(f"Exception in image generation {i}: {str(result)}", exc_info=result)
            elif result is not None:
                output_assets.append(result)
                if result.get("url"):
                    stream_image(result["url"], "First shot" if len(output_assets) == 1 else f"Variation {len(output_assets)}")
            else:
                log.warning(f"Image generation {i} returned None (generation failed)")
        
        successful_images = len(output_assets)

        # Format response to match output schema
        log.info(f"Product swap workflow completed: {successful_images} image(s) generated successfully")

        stream_progress(id="generate-assets", status="completed" if successful_images > 0 else "failed")

        if successful_images == 0:
            # Collect error messages from failed generations
            errors = [str(r) for r in generation_results if isinstance(r, Exception)]
            error_msg = errors[0] if errors else "All image generations failed"
            return {
                "success": False,
                "outputAssets": [],
                "error": error_msg
            }

        return {
            "success": True,
            "outputAssets": output_assets
        }
        
    except Exception as e:
        log.error(f"Error in product swap workflow: {str(e)}", exc_info=True)
        raise e
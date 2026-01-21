"""
Steal the Look Workflow Implementation

This workflow performs editorial style transfer, generating variations that strongly
adhere to the visual vibe of a reference image while ensuring natural, physically
correct interaction with the provided product.

This is HIGH-FIDELITY EDITORIAL STYLE TRANSFER, not scene reconstruction or exact replication.
The output images should look like they belong to the same editorial set as the reference,
with ~90% stylistic similarity but natural product interaction.

It uses Gemini 2.5 Pro to analyze both images and generate detailed style transfer prompts,
then uses Gemini 3 Pro to generate the styled images in parallel.
"""
import asyncio
import json
from typing import Dict, Any, Optional
from shared_libs.libs.logger import log
from shared_libs.utils.image_gen import generate_image, AspectRatio, OutputFormat
from shared_libs.utils.chat_gemini import chat_gemini
from shared_libs.libs.streaming import stream_progress, stream_image

STEAL_THE_LOOK_SYSTEM_PROMPT = """YOU ARE AN ELITE EDITORIAL STYLE TRANSFER ENGINE.

Your task is to generate fashion/editorial image generation prompts that
STRONGLY ADHERE TO THE VISUAL VIBE of a reference image while ensuring
NATURAL, PHYSICALLY CORRECT interaction with the provided product.

This is NOT scene reconstruction.
This is NOT product swapping.
This is NOT pose replication.
This is HIGH-FIDELITY EDITORIAL STYLE TRANSFER.

==========================================================
MISSION
==========================================================

Inputs:
1. IMAGE 1 — REFERENCE IMAGE
   This image defines the EDITORIAL VIBE and VISUAL LANGUAGE.
   It must strongly influence the output, but must NOT be copied literally.

2. IMAGE 2 — PRODUCT IMAGE
   This is the authoritative source of the product's:
   - geometry
   - materials
   - structure
   - category (garment, bag, accessory, etc.)

3. Custom description (optional)
   If provided, this applies to ALL variations without exception.

4. Number of variations: {num_variations}

Output:
Generate {num_variations} prompts that create images which look like they
BELONG TO THE SAME EDITORIAL SET as the reference image, while featuring
the product from Image 2 with correct, natural interaction.

==========================================================
REFERENCE IMAGE INTERPRETATION (MANDATORY)
==========================================================

Before generating any prompts, you MUST internally abstract the reference image into a concise **vibe profile**.

This vibe profile represents the dominant characteristics of the reference image such as:
- Overall fashion culture and category
- Energy level and attitude
- Visual density (minimal vs expressive)
- Background character and context

ALL generated variations MUST align with this abstracted vibe profile.

Do NOT transfer isolated elements (such as a single pose or action) without preserving the overall vibe.

### REFERENCE VIBE ENFORCEMENT (MANDATORY)

If a reference image is provided, the generated output MUST be clearly recognizable
as belonging to the same stylistic and cultural universe as the reference image.

If the generated image could plausibly exist without the reference image,
then the reference vibe has NOT been applied correctly.

Neutral or generic editorial outputs are NOT acceptable
when the reference image expresses a strong or specific vibe.

==========================================================
CRITICAL PRINCIPLES (READ CAREFULLY)
==========================================================

### 1. REFERENCE IMAGE = VIBE DOMINANT, NOT STRUCTURE DOMINANT

The reference image controls:
- Editorial mood
- Fashion sensibility
- Color palette and tonal family
- Lighting softness and direction
- Background type (studio, minimal interior, etc.)
- Overall aesthetic language

The reference image does NOT lock:
- Exact pose
- Exact hand position
- Exact framing
- Exact body geometry
- Exact object placement
- Model identity

The generated image must feel ~90% stylistically similar,
but must NOT be a reconstruction.

Think:
"Same campaign, different shot."

==========================================================
MODEL IDENTITY & VARIATIONS (NON-NEGOTIABLE)
==========================================================

### MODEL IDENTITY AUTHORITY (AUTO MODE)

By default, the human subject shown in the reference image MUST NOT be reused.

If the reference image contains a recognizable or celebrity individual,
you MUST generate a different model identity in all variations.

The ONLY exception is when the custom description explicitly requests
preserving the same person.

If no custom description is provided, identity replacement is mandatory.

### CELEBRITY IDENTITY SUPPRESSION (MANDATORY)

If the reference image contains a recognizable public figure,
celebrity, or widely known individual:

- You MUST NOT recreate, resemble, or approximate that person.

- The generated model must have a clearly different face, features, and identity.

- Treat the reference person as STRICTLY NON-TRANSFERABLE.

Only preserve non-identity elements such as:
- vibe
- styling direction
- pose energy
- scene character

The ONLY exception is when the custom description explicitly requests
the same celebrity or public figure.

- EACH variation MUST feature a DIFFERENT HUMAN MODEL.
- No identity carryover between variations.
- No lookalikes.
- No facial similarity reuse.

Identity diversity is mandatory.

==========================================================
OUTFIT & STYLING RULES
==========================================================

Outfit must be STRONGLY DERIVED from the reference image:
- Same color family (e.g. white → off-white / cream, NOT black)
- Same silhouette category (dress → dress, knit → knit)
- Same formality level
- Same seasonality
- Same editorial intent

Outfit may be adjusted ONLY to better support the product.

If the product is a GARMENT:
- The product MUST be worn
- The garment MUST NOT be altered
- Styling adapts around the garment

==========================================================
PRODUCT INTERACTION INTELLIGENCE (CRITICAL)
==========================================================

You MUST reason about how the product is meant to be interacted with.

Before deciding pose or interaction:
- Identify the product category
- Identify physical features (e.g. chain vs handle, rigid vs soft)

If the reference pose depends on a feature the product does NOT have:
(e.g. chain tension, shoulder carry, rigid structure)
→ You MUST ADAPT the pose to something NATURAL for the product.

If a reference pose conflicts with the physical design or intended use of the product,
adapt the pose to suit the product while preserving the reference vibe.

### PRODUCT INTERACTION MODE CONSISTENCY

Determine the primary interaction mode for the product
(e.g. held, worn, displayed, carried) based on the reference image
and the first valid variation.

ALL subsequent variations MUST preserve this interaction mode.

Do NOT switch interaction modes between variations
(e.g. from held to worn, or displayed to worn)
unless explicitly requested in the custom description.

POSE MUST SERVE THE PRODUCT, NOT THE REFERENCE IMAGE.

==========================================================
POSE & COMPOSITION GUIDANCE
==========================================================

- Pose should feel editorial and calm
- Pose may differ from reference
- Pose must look physically plausible
- Pose must naturally showcase the product

DO NOT copy hand placement or body angles blindly.

### ACTION TRANSFER SAFETY

Do NOT transfer a single action or interaction from the reference image
without also preserving the surrounding visual and cultural context.

If an action (e.g. holding a product) is adopted,
it MUST exist within the same vibe profile derived from the reference image.

==========================================================
BACKGROUND & ENVIRONMENT
==========================================================

- Same TYPE of environment as reference
- Similar light quality and color temperature
- Similar simplicity and depth

Exact replication is forbidden.

==========================================================
CUSTOM DESCRIPTION (ABSOLUTE AUTHORITY - APPLIES TO ALL VARIATIONS)
==========================================================

**CRITICAL RULE**: If a custom description is provided:
- It applies to EVERY SINGLE variation (ALL {num_variations} variations)
- It must be integrated into ALL variation prompts
- It overrides stylistic drift
- It must be applied consistently across ALL variations
- NO variation may ignore, skip, or reinterpret it

REMEMBER: Custom description = MANDATORY for ALL variations, not optional or selective.

==========================================================
OUTPUT FORMAT (JSON ONLY)
==========================================================

**CRITICAL REQUIREMENTS FOR ALL VARIATIONS**:
1. ALL {num_variations} variations MUST be HEAVILY INSPIRED by the reference image (~90% stylistic similarity)
2. ALL {num_variations} variations MUST apply custom description (if provided) - NO EXCEPTIONS
3. Each variation features a DIFFERENT model (unique identity)
4. All variations maintain strong visual consistency (same editorial set/campaign vibe)

Return JSON with this structure:

{{
  "metadata": {{
    "numVariations": {num_variations},
    "customInstructionsApplied": true | false
  }},
  "variations": [
    {{
      "variationId": 1,
      "prompt": {{
        "main": "Natural-language prompt that generates an editorial image HEAVILY INSPIRED by the reference image (strong stylistic similarity, same campaign vibe), featuring a different model, a similar outfit derived from reference, adaptive pose based on product physics, correct product interaction, and custom description applied if provided. This variation must feel like it belongs to the same editorial set as the reference.",
        "emphasis": "HEAVY inspiration from reference image (~90% stylistic similarity), custom description integration (if provided), natural product interaction, different model identity, consistent editorial vibe across all variations",
        "negative": "exact pose replication, same model, lookalike, facial resemblance to reference person, similar facial structure, similar eyes/nose/lips/jawline, similar hairstyle associated with reference, celebrity likeness, public figure continuity, unnatural hand placement, floating product, distorted product, swapped product behavior, ignoring custom description, stylistic drift from reference"
      }}
    }}
    // ... repeat for ALL {num_variations} variations
  ]
}}

**REMINDER**: Every single variation must:
- Be heavily inspired by the reference image
- Apply custom description (if provided)
- Feature a different model
- Maintain editorial consistency

==========================================================
FINAL REMINDER
==========================================================

This is EDITORIAL STYLE TRANSFER, not reconstruction.

**FOR ALL {num_variations} VARIATIONS**:
- ALL variations must be HEAVILY INSPIRED by the reference image (~90% stylistic similarity)
- ALL variations must apply custom description (if provided) - MANDATORY, NO EXCEPTIONS
- Each variation features a DIFFERENT model (unique identity)
- Strong visual consistency across all variations (same editorial set)

Strong similarity.
Natural interaction.
Different humans.
Product-first physics.
Custom description compliance (ALL variations).

If there is a conflict:
PRODUCT REALISM > POSE SIMILARITY > SCENE SIMILARITY.

But NEVER sacrifice:
- Reference image inspiration (ALL variations)
- Custom description application (ALL variations if provided)

### IDENTITY OVERRIDE PRIORITY

When a conflict exists between preserving reference vibe
and changing the human subject identity,
ALWAYS prioritize identity change.

Vibe similarity must NEVER come from facial likeness.

### FACE & LIKENESS RESTRICTION

Do NOT generate a face that resembles, approximates, or can be recognized
as the same person shown in the reference image.

This includes:
- similar facial structure
- similar eyes, nose, lips, or jawline
- similar hairline or hairstyle strongly associated with the reference
- any likeness that could imply the same individual

The generated person must be unrecognizable as the reference individual.

### VIBE PRIORITY RULE

When there is no custom description provided,
the reference image vibe takes priority over neutral or minimal styling.

Do NOT default to clean, generic, or catalog-style imagery
if the reference image expresses a strong attitude, culture, or energy.

### SELF-CHECK (INTERNAL)

Before finalizing each prompt, verify:

"Would this image still make sense if the reference image were removed?"

If yes, the reference influence is too weak.

Strengthen alignment to the reference vibe and reframe the prompt.
"""


async def steal_the_look_workflow(
    product_image: str,
    reference_image: str,
    custom_description: Optional[str] = None,
    aspect_ratio: AspectRatio = AspectRatio.RATIO_1_1,
    output_format: OutputFormat = OutputFormat.JPEG,
    num_variations: int = 2,
) -> Dict[str, Any]:
    """
    Steal the look workflow implementation.

    Performs editorial style transfer, generating variations that strongly adhere to the
    visual vibe of a reference image (~90% stylistic similarity) while ensuring natural,
    physically correct interaction with the provided product.

    This is HIGH-FIDELITY EDITORIAL STYLE TRANSFER, not scene reconstruction.
    The output images should look like they belong to the same editorial set as the reference.

    Uses Gemini 2.5 Pro for analysis and Gemini 3 Pro for image generation.

    Args:
        product_image: URL of the product image (Image 2 - authoritative source of product geometry, materials, structure)
        reference_image: URL of the reference image (Image 1 - defines editorial vibe and visual language)
        custom_description: Optional custom instructions that apply to ALL variations
        aspect_ratio: Aspect ratio enum for the output images
        output_format: Output format enum (defaults to JPEG)
        num_variations: Number of variations to generate (default: 2)

    Returns:
        Dictionary matching the output schema with generated image URLs
    """
    log.info("Executing steal the look workflow...")


    # Validate required inputs
    if not product_image:
        log.error("Missing required parameter: product_image")
        return {
            "metadata": {
                "workflow": "steal_the_look",
                "images_generated": 0,
                "message": "Error: Missing required parameter 'product_image'"
            },
            "outputAssets": []
        }

    if not reference_image:
        log.error("Missing required parameter: reference_image")
        return {
            "metadata": {
                "workflow": "steal_the_look",
                "images_generated": 0,
                "message": "Error: Missing required parameter 'reference_image'"
            },
            "outputAssets": []
        }

    log.info(f"Steal the look workflow - Product image: {product_image}, Reference image: {reference_image}, Custom description: {custom_description}, Num variations: {num_variations}")

    stream_progress(id="analyze-request", status="completed", wait_for=15)

    try:
        # Step 1: Gemini 2.5 Pro Analysis & Prompt Generation

        log.info("Step 1: Calling Gemini 2.5 Pro to analyze and generate editorial style transfer prompts...")
        # Build user message
        user_message_content = "Analyze the reference image (Image 1) and product image (Image 2) to generate editorial style transfer prompts.\n"
        user_message_content += "Image 1 (Reference): Defines the EDITORIAL VIBE and VISUAL LANGUAGE - mood, color palette, lighting, background type, fashion sensibility. Use this as strong inspiration, NOT for exact replication.\n"
        user_message_content += "Image 2 (Product): Authoritative source of product geometry, materials, structure, and category. This product must be featured with natural, physically correct interaction.\n"
        if custom_description:
            user_message_content += f"\nCustom description (applies to ALL variations): {custom_description}\n"
        user_message_content += f"\nGenerate {num_variations} detailed prompts for editorial style transfer that:\n"
        user_message_content += f"- ALL {num_variations} variations must be HEAVILY INSPIRED by the reference image (~90% stylistic similarity, same campaign vibe)\n"
        user_message_content += f"- ALL {num_variations} variations must apply the custom description (if provided) - MANDATORY for every variation\n"
        user_message_content += f"- Feature a DIFFERENT model in each variation (unique identity, no lookalikes)\n"
        user_message_content += f"- Ensure natural, physically correct product interaction (adapt pose if needed for product physics)\n"
        user_message_content += f"- Maintain strong outfit/styling similarity to reference (same color family, silhouette category, formality)\n"
        user_message_content += f"- Prioritize PRODUCT REALISM over exact pose replication when conflicts occur\n"
        user_message_content += f"\nCRITICAL: Every single variation must be heavily inspired by the reference AND apply custom description (if provided). No exceptions."

        user_message_content = [
            {
                "type": "text",
                "text": user_message_content
            },
        ]
        if reference_image:
            user_message_content.append({"type": "image_url", "image_url": {"url": reference_image}})
        if product_image:
            user_message_content.append({"type": "image_url", "image_url": {"url": product_image}})

        # Format message with both images for vision API
        # Note: Image order: reference_image (Image 1) first, then product_image (Image 2)
        messages = [
            {
                "role": "system",
                "content": STEAL_THE_LOOK_SYSTEM_PROMPT.format(num_variations=num_variations)
            },
            {
                "role": "user",
                "content": user_message_content
            }
        ]

        # Call Gemini API
        response = await chat_gemini(
            messages=messages,
            model="gemini-2.5-pro",
            temperature=0.7,
            timeout=120
        )

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
                    "workflow": "steal_the_look",
                    "images_generated": 0,
                    "message": "Error: Failed to parse Gemini response as JSON"
                },
                "outputAssets": []
            }

        variations = response_data.get("variations", [])

        if not variations:
            log.error("Gemini returned no variations")
            return {
                "metadata": {
                    "workflow": "steal_the_look",
                    "images_generated": 0,
                    "message": "Error: Gemini returned no variations"
                },
                "outputAssets": []
            }

        log.info(f"Step 1 completed: Generated {len(variations)} variation(s)")
        stream_progress(id="plan-style-transfer", status="completed")

        # Step 2: Generate images for each variation concurrently
        log.info(f"Step 2: Generating {len(variations)} style transfer images concurrently with Gemini...")

        async def _generate_single_style_image(
            variation: Dict[str, Any],
            index: int
        ) -> Optional[Dict[str, Any]]:
            """Generate a single style transfer image with error handling."""
            variation_id = variation.get("variationId", index)
            prompt_data = variation.get("prompt", {})
            prompt_text = prompt_data.get("main", "")
            emphasis = prompt_data.get("emphasis", "")

            log.info(f"Generating style transfer image {index} (variation {variation_id})")

            try:
                # Add explicit instruction for Gemini to perform editorial style transfer
                gemini_instruction = """CRITICAL INSTRUCTIONS FOR EDITORIAL STYLE TRANSFER:
- This is EDITORIAL STYLE TRANSFER, not scene reconstruction
- The reference image defines the VIBE and VISUAL LANGUAGE - use it for inspiration, not exact replication
- Generate a COMPLETELY DIFFERENT person/model with unique identity (different face, features, identity)
- Maintain ~90% stylistic similarity to reference (same campaign vibe, color family, lighting mood)
- Ensure NATURAL, PHYSICALLY CORRECT product interaction - adapt pose if needed for product physics
- The product should rest/interact naturally with gravity and realistic weight
- Maintain the same color family and tonal range as the reference image
- Pose must serve the product, not blindly copy the reference pose

"""
                # Combine instruction with main prompt and emphasis
                full_prompt = gemini_instruction + prompt_text
                if emphasis:
                    full_prompt = full_prompt + f"\n\nEmphasis: {emphasis}"

                # Format images as list of dicts expected by generate_image
                images = [{"url": product_image, "name": "product"}]
                if reference_image:
                    images.append({"url": reference_image, "name": "reference"})

                # Call generate_image function
                result = await generate_image(
                    prompt=full_prompt,
                    images=images,
                    tag=f"steal-the-look-v{index}",
                    aspect_ratio=aspect_ratio,
                    output_format=output_format
                )

                # Check if generation was successful
                if "error" in result:
                    log.error(f"Image generation {index} failed: {result.get('error')}")
                    return None

                log.info(f"Style transfer image {index} generated successfully: {result.get('url')}")

                return {
                    "type": "image",
                    "url": result["url"],
                    "metadata": {
                        "variationId": variation_id,
                        "tag": result.get("tag", "steal-the-look"),
                        "id": result.get("id"),
                        "source": result.get("source", "Nano 🍌"),
                        "priorities": variation.get("priorities", [])
                    }
                }
            except Exception as e:
                log.error(f"Exception during image generation {index}: {str(e)}", exc_info=True)
                return None

        # Create concurrent generation tasks
        generation_tasks = [
            _generate_single_style_image(variation, i)
            for i, variation in enumerate(variations, 1)
        ]


        # Execute all generations concurrently
        # return_exceptions=True ensures one failure doesn't stop others
        generation_results = await asyncio.gather(*generation_tasks, return_exceptions=True)

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
        log.info(f"Steal the look workflow completed: {successful_images} image(s) generated successfully")

        stream_progress(id="generate-assets", status="completed")
        metadata = {
            "workflow": "steal_the_look",
            "images_generated": successful_images,
            "message": f"Successfully generated {successful_images} style transfer image(s)"
        }
        log.info(f"Steal the look workflow completed successfully: {metadata}")

        return {
            "success": True,
            "outputAssets": output_assets
        }

    except Exception as e:
        log.error(f"Error in steal the look workflow: {str(e)}", exc_info=True)
        raise e
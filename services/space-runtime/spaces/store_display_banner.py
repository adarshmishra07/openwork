"""
Store Display Banner Workflow

Generates large-format poster and store display visuals using product images and campaign text.
Optimized for print clarity, wide layouts, and strong in-store visibility.
"""
import json
import asyncio
import traceback
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from shared_libs.libs.logger import log
from shared_libs.libs.streaming import stream_progress, stream_image
from shared_libs.utils.image_gen import generate_image, AspectRatio, OutputFormat
from shared_libs.utils.chat_openai import chat_openai


# Simple message classes to replace langchain (same pattern as other spaces)
@dataclass
class HumanMessage:
    content: Any
    type: str = "human"


@dataclass
class SystemMessage:
    content: str
    type: str = "system"


def build_system_prompt(aspect_ratio: str, num_variations: int, brand_memory: Optional[Dict[str, Any]] = None) -> str:
    """Build the system prompt with optional brand context."""
    
    # Extract brand context if available
    brand_context = ""
    if brand_memory:
        brand_name = brand_memory.get("brandName", "")
        brand_voice = brand_memory.get("voiceTone", "")
        brand_colors = brand_memory.get("colors", [])
        brand_style = brand_memory.get("visualStyle", "")
        
        if brand_name or brand_voice or brand_colors or brand_style:
            brand_context = "\n\nBRAND CONTEXT (incorporate these into the design):\n"
            if brand_name:
                brand_context += f"- Brand Name: {brand_name}\n"
            if brand_voice:
                brand_context += f"- Brand Voice/Tone: {brand_voice}\n"
            if brand_colors:
                colors_str = ", ".join(brand_colors) if isinstance(brand_colors, list) else str(brand_colors)
                brand_context += f"- Brand Colors: {colors_str}\n"
            if brand_style:
                brand_context += f"- Visual Style: {brand_style}\n"
            brand_context += "\nEnsure the poster design reflects this brand identity while maintaining the cinematic quality.\n"
    
    return f"""ROLE

You are an elite retail display designer and visual storytelling specialist creating show-stopping store posters and display banners that turn products into cultural artifacts.

Your approach: treat every poster as a complete visual universe compressed into large-format print. You don't just design posters — you construct immersive worlds where products feel iconic, collectible, and narratively significant. Each poster is a portal that stops foot traffic and demands attention.

Your outputs are cinematic, atmospheric, built for maximum in-store impact, and optimized for large-format print clarity.
{brand_context}
INSTRUCTIONS

Step 1: Read the Products' Visual DNA

Analyze the provided inputs for:

Product images: Materials, textures, colors, form, and the emotional energy they project

Custom description: Campaign message, tone, or style direction (e.g., "End of Season Sale", "Minimal premium", "Big bold headline")

Reference images (if provided): Brand aesthetic, visual language to match or evolve

The lifestyle, identity, or world these products could belong to

Step 2: Construct a Visual Universe

Based on the products' character and campaign message, build a thematic world around them. Consider:

What environment would make these products feel iconic and unmissable?

What atmospheric elements amplify their essence and stop people mid-stride?

What unexpected genre fusion or visual narrative could make this memorable and shareable?

How can the poster feel like a complete cinematic moment, not just a product layout?

IF reference/moodboard images are provided: Extract their style DNA (color palette, mood, lighting, composition) and use as the foundation for your universe.

IF custom description is provided: Use it as the thematic anchor and tonal guide for your world-building.

Step 3: Generate the Prompt

Create a cinematic, large-format poster prompt with:

Environmental World-Building:

Specific setting/environment that elevates the products (not generic backdrops)

6-10 layered atmospheric details (materials, lighting effects, textures, weather, time of day)

Precise lighting descriptions (sources, colors, dramatic qualities, shadows)

Immersive depth and visual richness

Product Positioning:

Heroic, iconic placement (products as artifacts, centerpieces, relics)

Clear visual hierarchy but dramatically staged

Products integrated into the world, not floating on backgrounds

Strategic negative space that doesn't sacrifice atmosphere

Typography Integration:

Headline that sounds collectible, narrative, or culturally loaded (not "BUY NOW")

Subtext that reinforces the world and offer

Typography style that belongs to the aesthetic universe you've built

Bold enough to read from distance but designed, not default

Text treated as environmental element (etched, neon, projected, carved, etc.)

Composition Specs:

Aspect ratio: {aspect_ratio} (common options: 2:3 portrait for vertical posters, 3:2 landscape for horizontal displays, 4:5 portrait for compact verticals, 16:9 landscape for wide banners)

Vertical compositions (2:3, 4:5) optimize for floor-standing posters and wall displays

Horizontal compositions (3:2, 16:9) optimize for above-shelf banners and window displays

High contrast core elements (product + key text) for distance legibility

CMYK-safe color palette with bold saturation

Clean edges on products, atmospheric effects as supporting layer

Use concrete, sensory, cinematic vocabulary. Avoid vague terms. Build complete visual worlds, not layouts.

Step 4: Quality Standards

Ensure the poster is:

Visually arresting: Stops people from 20+ feet away

Atmospherically rich: Feels like a complete world, not a template

Product-clear: Hero items unmistakable despite dramatic staging

Print-ready: High resolution, proper contrast for large-format output

Campaign-aligned: Message and offer immediately clear within the narrative

Retail-optimized: Works under store lighting, commands attention in crowded environments

OUTPUT FORMAT

You must respond with valid JSON containing exactly these two fields:

{{
  "generation_prompts": ["<prompt 1>", "<prompt 2>", ...],
  "negative_prompt": "<concise list of undesirable qualities>"
}}

Where generation_prompts contains {num_variations} distinct cinematic poster prompts.

No extra commentary. No explanations. Only valid JSON with the two fields above.

IMPORTANT: Generate {num_variations} distinct variations of this poster design. Each variation should have a unique visual approach, different atmospheric elements, varied composition, and distinct typography treatment while maintaining the same core product and message. Ensure each variation feels like a complete, standalone design option.

<strict>
- In all variations, it should have the text like offer details. But in different style, format, template etc.
- Response must be valid JSON only.
</strict>
"""


async def run_poster_design_workflow(
    product_images: List[str],
    user_query: str = "",
    aspect_ratio: str = "1:1",
    output_format: str = "jpeg",
    reference_image: Optional[str] = None,
    num_variations: int = 4,
    brand_memory: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generates large-format poster or store display visuals using product images and campaign text.
    Optimized for print clarity, wide layouts, and strong in-store visibility.
    
    Args:
        product_images: List of image URLs (optional)
        user_query: Required key message, offer, or style direction
        aspect_ratio: Desired aspect ratio (e.g., "1:1", "16:9", "A2", "A3")
        output_format: Output format (e.g., "jpeg", "png", "pdf")
        reference_image: Optional reference/moodboard image URL
        num_variations: Number of variations to generate (1-10)
        brand_memory: Optional brand context (name, colors, voice, style)
        
    Returns:
        Standard workflow response dictionary
    """
    
    log.info(f"Starting poster design generation with {len(product_images) if product_images else 0} images, {num_variations} variation(s)")
    if brand_memory:
        log.info(f"Brand memory provided: {brand_memory.get('brandName', 'unknown')}")
    
    try:
        # Build system prompt with brand context
        formatted_system_prompt = build_system_prompt(aspect_ratio, num_variations, brand_memory)
        
        # Build user message content with images
        user_content = []
        
        # Add text instruction
        instruction_text = "Analyze the PRODUCT IMAGES provided below and generate a promotional visual prompt based on their visual characteristics."
        if user_query:
            instruction_text += f"\n\nCustom description/creative direction: {user_query}"
        if num_variations > 1:
            instruction_text += f"\n\nGenerate {num_variations} distinct variations of the poster design."
        
        user_content.append({"type": "text", "text": instruction_text})
        
        # Add product images with clear labeling
        if product_images:
            for idx, url in enumerate(product_images):
                user_content.append({
                    "type": "text",
                    "text": f"PRODUCT IMAGE {idx + 1}:"
                })
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": url}
                })
        
        # Add background/reference image if provided with clear labeling
        if reference_image:
            user_content.append({
                "type": "text",
                "text": "REFERENCE/MOODBOARD IMAGE (use this for style extraction - color palette, typography, lighting, mood):"
            })
            user_content.append({
                "type": "image_url",
                "image_url": {"url": reference_image}
            })
        
        # Prepare messages for OpenAI
        messages = [
            SystemMessage(content=formatted_system_prompt),
            HumanMessage(content=user_content)
        ]
        
        log.info("Calling OpenAI to generate prompt...")
        
        # Call OpenAI to generate the prompt
        prompt_response = await chat_openai(
            messages=messages,
            model="gpt-4o",
            temperature=0.8
        )
        
        # Parse JSON response
        response_text = prompt_response.content.strip()
        
        # Handle markdown code blocks if present
        if response_text.startswith("```"):
            # Extract JSON from code block
            lines = response_text.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```") and not in_block:
                    in_block = True
                    continue
                elif line.startswith("```") and in_block:
                    break
                elif in_block:
                    json_lines.append(line)
            response_text = "\n".join(json_lines)
        
        try:
            parsed_response = json.loads(response_text)
            generation_prompts = parsed_response.get("generation_prompts", [])
            negative_prompt = parsed_response.get("negative_prompt", "flat lighting, generic backgrounds, lifeless composition")
        except json.JSONDecodeError as e:
            log.error(f"Failed to parse OpenAI response as JSON: {response_text[:500]}")
            log.error(f"JSON error: {e}")
            # Fallback: use the response as a single prompt
            generation_prompts = [response_text]
            negative_prompt = "flat lighting, generic backgrounds, lifeless composition"
        
        log.info(f"Generated {len(generation_prompts)} prompts...")
        
        # Format images for image_gen (list[dict[str, any]])
        formatted_images = []
        if product_images:
            for idx, url in enumerate(product_images):
                formatted_images.append({
                    "name": f"Product {idx + 1}",
                    "url": url
                })
        
        # Ensure we have enough prompts for variations
        if len(generation_prompts) < num_variations:
            difference = num_variations - len(generation_prompts)
            for i in range(difference):
                if len(generation_prompts) > 0:
                    generation_prompts.append(generation_prompts[0])
                else:
                    raise ValueError("No prompts generated for store display banner")

        stream_progress(id="layout-display", status="completed")
        
        # Generate multiple variations
        tasks = []
        for variation_num in range(1, num_variations + 1):
            log.info(f"Generating variation {variation_num}/{num_variations} with Gemini...")

            # Combine generation prompt with negative prompt
            full_prompt = f"{generation_prompts[variation_num - 1]}\n\nNegative prompt: {negative_prompt}"
            
            # Add variation number to tag for uniqueness
            variation_tag = f"store-display-banner-v{variation_num}"

            tasks.append(generate_image(
                prompt=full_prompt,
                images=formatted_images,
                tag=variation_tag,
                aspect_ratio=AspectRatio(aspect_ratio) if isinstance(aspect_ratio, str) else aspect_ratio,
                output_format=OutputFormat(output_format) if isinstance(output_format, str) else output_format,
            ))
            
        output_assets = await asyncio.gather(*tasks)

        for idx, output_asset in enumerate(output_assets, 1):
            if "metadata" in output_asset and "error" in output_asset.get("metadata", {}):
                error_msg = output_asset["metadata"]["error"]
                log.error(f"Image generation failed for variation {idx}: {error_msg}")
            if output_asset.get("url"):
                label = "First shot" if idx == 1 else f"Variation {idx}"
                stream_image(output_asset["url"], label)
            else:
                log.error(f"Image generation succeeded but no URL returned for variation {idx}")

        
        stream_progress(id="generate-assets", status="completed")
        metadata = {
            "workflow": "poster_design",
            "images_generated": num_variations,
            "message": f"Successfully generated {num_variations} poster design variation(s)",
            "generation_prompts": generation_prompts,
            "negative_prompt": negative_prompt,
            "brand_context_used": brand_memory is not None
        }
        log.info(f"Poster design workflow completed successfully: {metadata}")

        # Format the output
        return {
            "success": True,
            "outputAssets": output_assets
        }
        
    except Exception as e:
        log.critical(f"Error in poster design workflow: {str(e)}")
        log.critical(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "outputAssets": []
        }
        

def store_display_banner_execute(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point for the store display banner space.
    Extracts inputs from body and runs the workflow.
    """
    product_images = body.get("product_images", [])
    user_query = body.get("user_query", "")
    aspect_ratio = body.get("aspect_ratio", "1:1")
    output_format = body.get("output_format", "png")
    reference_image = body.get("reference_image", None)
    num_variations = body.get("num_variations", 1)
    
    # Extract brand memory if provided by the desktop client
    brand_memory = body.get("brand_memory", None)
    
    log.info(f"store_display_banner_execute called with: images={len(product_images)}, query={user_query[:50] if user_query else 'none'}, brand_memory={'yes' if brand_memory else 'no'}")

    stream_progress(id="analyze-request", status="completed", wait_for=15)
    
    return asyncio.run(run_poster_design_workflow(
        product_images=product_images,
        user_query=user_query,
        aspect_ratio=aspect_ratio,
        output_format=output_format,
        reference_image=reference_image,
        num_variations=num_variations,
        brand_memory=brand_memory
    ))

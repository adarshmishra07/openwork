"""
Multi-Product Try-On Workflow

Generates authentic editorial magazine photographs (GQ/Vogue style) featuring a model 
wearing multiple product items simultaneously. Creates film photography aesthetic with 
intelligent integration of custom descriptions and reference images.
"""
import traceback
import asyncio
import json
import time
import base64
import httpx
from typing import Dict, Any, List
from uuid import uuid4

from shared_libs.libs.logger import log
from shared_libs.libs.streaming import stream_progress
from shared_libs.utils.image_gen import generate_image, AspectRatio, OutputFormat
from shared_libs.utils.chat_gemini import chat_gemini


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

async def _download_image_to_base64(image_url: str, timeout: int = 30) -> str:
    """
    Download image from URL and convert to base64 data URL.
    This helps avoid timeout issues with the model fetching external URLs directly.
    """
    try:
        log.info(f"Downloading image: {image_url}")
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            
            content_type = response.headers.get("content-type", "image/jpeg")
            image_bytes = response.content
            base64_image = base64.b64encode(image_bytes).decode('utf-8')
            data_url = f"data:{content_type};base64,{base64_image}"
            log.info(f"Successfully downloaded and converted image (size: {len(image_bytes)} bytes)")
            return data_url
            
    except Exception as e:
        log.error(f"Failed to download image {image_url}: {e}")
        raise ValueError(f"Could not download image from {image_url}: {str(e)}")


async def _build_analysis_content(
    product_images: List[str],
    reference_images: List[str],
    editorial_direction: str,
    custom_description: str,
    num_variations: int
) -> List[Dict[str, Any]]:
    """Build content with proper hierarchy and clear instructions"""
    
    content_parts = []
    
    # Main instruction with hierarchy
    main_instruction = _create_multiproduct_prompt(
        product_images=product_images,
        reference_images=reference_images,
        editorial_direction=editorial_direction,
        custom_description=custom_description,
        num_variations=num_variations
    )
    content_parts.append({"type": "text", "text": main_instruction})
    
    # Reference images FIRST (highest priority)
    if reference_images:
        content_parts.append({
            "type": "text",
            "text": "\n🎯 REFERENCE IMAGES (HIGHEST PRIORITY - REPLICATE THIS STYLE):"
        })
        for idx, ref_url in enumerate(reference_images):
            content_parts.append({
                "type": "text",
                "text": f"\nREFERENCE {idx+1} - Extract and replicate: setting, lighting, composition, mood, colors:"
            })
            try:
                data_url = await _download_image_to_base64(ref_url)
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": data_url}
                })
            except Exception as e:
                log.warning(f"Failed to download reference image {idx+1}: {e}")
    
    # Product images (must be worn)
    content_parts.append({
        "type": "text", 
        "text": "\n👕 PRODUCT IMAGES (MUST BE WORN BY MODEL):"
    })
    for idx, img_url in enumerate(product_images):
        content_parts.append({
            "type": "text",
            "text": f"\nPRODUCT {idx+1} (Required on model):"
        })
        try:
            data_url = await _download_image_to_base64(img_url)
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": data_url}
            })
        except Exception as e:
            log.error(f"Failed to download product image {idx+1}: {e}")
            raise ValueError(f"Could not load product image {idx+1} from {img_url}")
    
    return content_parts


def _get_base_editorial_direction(has_references: bool = False, custom_description: str = "") -> str:
    """Create adaptive base direction that responds to user inputs"""
    
    # Build setting description dynamically
    if has_references:
        setting_instruction = """
SETTING GUIDELINES (CRITICAL):
- Extract and replicate the EXACT setting/location shown in reference images
- Match the architectural style, cultural context, and environmental mood from references
- If custom description adds setting details, blend with reference image setting
- Maintain editorial sophistication while staying true to reference aesthetic
"""
    elif custom_description and custom_description.strip():
        setting_instruction = f"""
SETTING (CUSTOM PRIORITY):
- {custom_description.strip()} with editorial sophistication and premium architectural character
- Enhance the custom setting with cinematic composition and professional polish
- Cultural authenticity and environmental details that support the custom direction
"""
    else:
        setting_instruction = """
SETTING:
- Sophisticated urban architecture with cultural authenticity and character
- Premium editorial environment that complements the products
- Elegant architectural details that enhance rather than distract
"""
    
    # Build model description dynamically  
    if custom_description and any(word in custom_description.lower() for word in ["man", "woman", "model", "person", "male", "female"]):
        model_instruction = f"""
MODEL & STYLING:
- {custom_description.strip()}, naturally stylish with confident editorial presence
- Relaxed yet sophisticated posture that embodies modern style icon aesthetic  
- ALL products from product images must be worn and clearly visible
"""
    else:
        model_instruction = """
MODEL & STYLING:
- Naturally stylish model with confident, relaxed posture and authentic expression
- Modern style icon aesthetic with effortless cool and sophisticated presence
- ALL products from product images must be worn and clearly visible
"""

    return f"""Transform the provided product images into an authentic editorial magazine photograph featuring a model wearing ALL the provided product items simultaneously. The model exudes subtle confidence — relaxed posture, natural movement, radiating the effortless cool of a modern style icon.

{setting_instruction}

{model_instruction}

STYLING REQUIREMENTS:
- ALL products from the product images must be worn by the model
- Each product should be clearly visible and naturally integrated
- Products should complement each other in the styling
- Authentic fit and drape — no stiff or artificial positioning

POSE & MOVEMENT:
- Capture the model mid-movement: stepping forward, turning toward the light, or leaning casually
- Avoid stiff commercial poses
- Natural, authentic body language
- Clothing falls and drapes realistically with natural creases and movement

AESTHETIC:
- Film-photography aesthetic: soft grain, rich contrast, subtly muted tones with warm highlights
- Shot during golden hour or soft daylight — gentle shadows emphasize features and textures
- Use 50mm or 85mm prime lens at f/1.8–f/2.8 for shallow depth of field
- Products are hero elements but seamlessly integrated into the overall mood

COMPOSITION:
- Editorial composition with strong leading lines, breathable negative space, cinematic cropping
- Full of character but never distracting from the products
- Professional magazine layout principles

AUTHENTICITY:
- Natural textures visible (skin, fabric, environment)
- Minor environmental "imperfections" add realism (subtle dust, lens flare, soft bokeh)
- No excessive smoothing or artificial CGI styling
- A breeze lifting fabric slightly, natural lighting transitions

COLOR GRADING:
- Warm film-like palette, refined shadows
- Rich, premium color clarity
- Avoid overly bright commercial vibes, hyper-saturation, or sterile studio backdrops

WHAT TO AVOID:
- Posed catalog looks, stiff shoulders
- Cartoonish reflections, glossy plastic-like skin
- Sterile environment, artificial CGI styling
- Harsh flash, over-processed look

DELIVERABLE QUALITY:
Contemporary GQ / Vogue magazine editorial — stylish, intimate, authentic, and aspirational."""


def _create_multiproduct_prompt(
    product_images: List[str],
    reference_images: List[str],
    editorial_direction: str,
    custom_description: str,
    num_variations: int
) -> str:
    """Create comprehensive prompt for LLM to generate editorial prompts with proper priority hierarchy"""
    
    ref_analysis_instruction = ""
    if reference_images:
        ref_analysis_instruction = f"""

🎯 **CRITICAL: REFERENCE IMAGE ANALYSIS REQUIRED**
You have {len(reference_images)} reference images that show the EXACT style, mood, composition, or setting the client wants.

Your task:
1. Analyze each reference image for: setting/location, lighting style, composition, color palette, mood/atmosphere, model pose/styling
2. Extract specific visual elements that should be replicated
3. Integrate these elements into your editorial prompts with HIGH PRIORITY
4. Reference images override any conflicting base instructions

**Reference images show the target aesthetic - treat them as REQUIREMENTS, not suggestions.**
"""
    
    custom_instruction = ""
    if custom_description and custom_description.strip():
        custom_instruction = f"""

🔥 **CUSTOM CREATIVE DIRECTION (HIGH PRIORITY):**
{custom_description.strip()}

This custom direction should be integrated with reference image analysis. If they complement each other, combine them intelligently. If they conflict, prioritize the reference images first, then custom directions.
"""

    return f"""You are a professional editorial fashion photographer and creative director specializing in high-end magazine photography (GQ, Vogue, Esquire style).

**YOUR TASK:** Analyze the provided product images, reference images, and custom directions to generate {num_variations} detailed editorial photography prompt(s) that show a model wearing ALL the products simultaneously.

**INTEGRATION PRIORITY (HIGHEST TO LOWEST):**
1. 🎯 Reference images (visual requirements - exact replication)
2. 🔥 Custom text description (specific client requests) 
3. 📋 Base editorial guidelines (professional standards and fallbacks)

**EDITORIAL DIRECTION:**
{editorial_direction}

{ref_analysis_instruction}

{custom_instruction}

**CRITICAL REQUIREMENTS:**
1. The model MUST wear ALL {len(product_images)} products shown in the product images
2. Each product should be clearly visible and naturally integrated into the styling
3. If reference images provided: Extract and replicate their exact aesthetic
4. If custom description provided: Integrate it as primary creative direction
5. Create authentic, editorial magazine aesthetic (not commercial/catalog)
6. Film photography aesthetic with natural lighting and authentic atmosphere

**ANALYSIS NEEDED:**
1. Reference image analysis: Extract specific visual elements to replicate
2. Product identification: type, color, style, material of each product
3. Custom direction integration: How to blend custom requests with visual references
4. Styling strategy: Best way to style all products together on a model
5. Scene design: Setting, lighting, and composition for editorial impact

**OUTPUT FORMAT (Return valid JSON):**

{{
  "reference_analysis": "Detailed analysis of what each reference image shows and specific elements to replicate (or 'No reference images provided' if none)",
  "custom_direction_integration": "How custom text directions are integrated with reference images and base guidelines (or 'No custom direction provided' if none)",
  "product_analysis": "Detailed analysis of all {len(product_images)} products and how they work together as a complete outfit",
  "editorial_prompts": [
    {{
      "scene_description": "Detailed setting based on reference images + custom direction (NOT default fallbacks if references provided)",
      "model_description": "Model characteristics matching reference aesthetic + custom requirements, with natural pose/movement",
      "product_integration": "Exactly how each product is worn on the model - be specific about visibility and styling of ALL products",
      "lighting_atmosphere": "Lighting that matches reference images or supports custom direction, with film aesthetic details",
      "camera_technical": "Camera setup that replicates reference quality: 50mm or 85mm prime lens, f/1.8-f/2.8, editorial framing",
      "color_grading": "Color palette extracted from reference images or supporting custom direction, warm film aesthetic",
      "composition_notes": "Composition matching reference style or editorial principles, leading lines, negative space",
      "avoid_elements": "Specific things to avoid that would conflict with reference images or custom direction"
    }}
    // ... {num_variations} total prompt(s)
  ]
}}

**IMPORTANT:**
- Be extremely specific about how each product is worn/styled
- If reference images provided, extract and replicate their specific visual elements
- If custom direction provided, integrate it prominently into all sections
- Ensure natural integration of multiple products (not forced or catalog-like)
- Maintain authentic editorial aesthetic throughout
- Return valid, parseable JSON only
"""


def _convert_editorial_prompt_to_text(prompt_data: Dict[str, Any], product_images: List[str]) -> str:
    """Convert structured editorial prompt to detailed text for image generation"""
    
    try:
        products_count = len(product_images)
        
        text_prompt = f"""Create an authentic editorial magazine photograph featuring a model wearing ALL {products_count} products shown in the provided product images.

SCENE & SETTING:
{prompt_data.get('scene_description', 'Sophisticated setting with editorial character')}

MODEL & POSE:
{prompt_data.get('model_description', 'Naturally stylish model with relaxed confidence')}

PRODUCT STYLING (CRITICAL - ALL PRODUCTS MUST BE VISIBLE):
{prompt_data.get('product_integration', 'All products worn naturally and clearly visible')}

LIGHTING & ATMOSPHERE:
{prompt_data.get('lighting_atmosphere', 'Golden hour soft lighting with film aesthetic')}

CAMERA & TECHNICAL:
{prompt_data.get('camera_technical', 'Shot on 50mm f/1.8, shallow depth of field, editorial quality')}

COLOR GRADING:
{prompt_data.get('color_grading', 'Warm film palette, muted tones, rich contrast')}

COMPOSITION:
{prompt_data.get('composition_notes', 'Editorial framing with negative space and leading lines')}

AVOID:
{prompt_data.get('avoid_elements', 'Catalog poses, artificial styling, harsh lighting, sterile backgrounds')}

DELIVERABLE: Contemporary GQ/Vogue magazine editorial photograph — authentic, sophisticated, aspirational. 
Film photography aesthetic with natural grain and authentic atmosphere. All products integrated seamlessly 
into an elevated lifestyle image. Shot on professional camera, 8k resolution, photorealistic editorial quality.
"""
        return text_prompt.strip()
        
    except Exception as e:
        log.error(f"Failed to convert editorial prompt to text: {e}")
        return f"""Create an authentic editorial magazine photograph with model wearing all {len(product_images)} products from the reference images. 
GQ/Vogue style, film aesthetic, golden hour lighting, sophisticated setting. Natural pose, professional composition, 8k editorial quality."""


def _parse_llm_response(response_text: str) -> Dict[str, Any]:
    """Parse LLM JSON response"""
    try:
        text = str(response_text).strip()
        
        # Strip markdown code blocks if present
        if "```" in text:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            else:
                text = text.split("```")[1].split("```")[0]
        
        return json.loads(text.strip())
    except (json.JSONDecodeError, IndexError):
        # Try to find JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except:
                pass
        
        log.warning("Could not parse LLM response as JSON, using fallback")
        return {
            "reference_analysis": "Unable to parse response", 
            "custom_direction_integration": "Unable to parse response",
            "product_analysis": "Unable to parse response", 
            "editorial_prompts": []
        }


def _create_fallback_prompt(product_images: List[str], editorial_direction: str, custom_description: str = "") -> Dict[str, Any]:
    """Create fallback editorial prompt if LLM generation fails"""
    
    setting = "Sophisticated setting with editorial character"
    if custom_description and custom_description.strip():
        setting = f"{custom_description.strip()} with editorial sophistication and premium character"
    
    return {
        "scene_description": setting,
        "model_description": f"Confident, naturally stylish model (age 25-32) with relaxed posture, mid-stride movement, authentic expression, modern style icon aesthetic",
        "product_integration": f"Model wearing all {len(product_images)} products from the product images - each item clearly visible and naturally integrated into the complete outfit. Products complement each other with authentic styling and realistic drape.",
        "lighting_atmosphere": "Soft golden hour light with gentle shadows, film photography aesthetic with subtle grain, warm highlights, natural atmospheric depth",
        "camera_technical": "Shot on 50mm f/2.0 prime lens, shallow depth of field, cinematic bokeh, editorial framing with rule of thirds composition",
        "color_grading": "Warm film-like palette with muted tones, rich browns and blacks, refined shadows, premium color clarity, subtle vintage aesthetic",
        "composition_notes": "Strong leading lines from architecture, breathable negative space, three-quarter body framing, cinematic editorial crop with environmental context",
        "avoid_elements": "Stiff catalog poses, glossy artificial skin, sterile backgrounds, harsh flash lighting, over-processed CGI look, cartoonish reflections"
    }


def _convert_aspect_ratio(aspect_ratio_str: str) -> AspectRatio:
    """Convert aspect ratio string to AspectRatio enum"""
    mapping = {
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
    return mapping.get(aspect_ratio_str, AspectRatio.RATIO_3_4)


def _convert_output_format(output_format_str: str) -> OutputFormat:
    """Convert output format string to OutputFormat enum"""
    mapping = {
        "jpg": OutputFormat.JPG,
        "jpeg": OutputFormat.JPEG,
        "png": OutputFormat.PNG,
        "webp": OutputFormat.WEBP,
    }
    return mapping.get(output_format_str.lower(), OutputFormat.PNG)


# ============================================================================
# MAIN WORKFLOW
# ============================================================================

async def _run_multiproduct_tryon_workflow(
    product_images: List[str],
    reference_images: List[str],
    custom_description: str,
    aspect_ratio: str,
    output_format: str,
    num_variations: int
) -> Dict[str, Any]:
    """
    Core Multi-Product Try-On workflow.
    
    Generates editorial magazine-style photographs with model wearing all products.
    """
    log.info("Executing Multi-Product Try-On workflow...")
    execution_start = time.perf_counter()

    try:
        if not product_images or len(product_images) < 1:
            raise ValueError("At least one product image is required")

        # Validate num_variations (max 15, default 4)
        num_variations = min(max(int(num_variations), 1), 15)

        # --- PHASE 1: ANALYZE PRODUCTS & GENERATE EDITORIAL PROMPT ---
        log.info("Step 1: Analyzing products, references, and generating editorial photography prompt...")
        
        # Create flexible base direction that adapts to user inputs
        editorial_direction = _get_base_editorial_direction(
            has_references=bool(reference_images),
            custom_description=custom_description
        )
        
        # Build content with proper hierarchy
        content_parts = await _build_analysis_content(
            product_images=product_images,
            reference_images=reference_images,
            editorial_direction=editorial_direction,
            custom_description=custom_description,
            num_variations=num_variations
        )
        
        # Call Gemini for editorial prompt generation
        response = await chat_gemini(
            messages=[{"role": "user", "content": content_parts}],
            model="gemini-2.5-pro",
            temperature=0.7,
            max_tokens=4096
        )
        response_text = response.content if hasattr(response, "content") else str(response)
        
        # Parse response
        editorial_prompts_data = _parse_llm_response(response_text)
        editorial_prompts = editorial_prompts_data.get("editorial_prompts", [])
        product_analysis = editorial_prompts_data.get("product_analysis", "")
        reference_analysis = editorial_prompts_data.get("reference_analysis", "")
        
        if not editorial_prompts:
            log.warning("No editorial prompts generated, using fallback")
            editorial_prompts = [_create_fallback_prompt(
                product_images, 
                editorial_direction,
                custom_description
            )]
        
        log.info(f"Generated {len(editorial_prompts)} editorial photography prompts")
        log.info(f"Product Analysis: {product_analysis[:150]}...")
        if reference_analysis:
            log.info(f"Reference Analysis: {reference_analysis[:150]}...")

        # Mark analyze-request as completed
        stream_progress(id="analyze-request", status="completed", wait_for=15)
        
        # Mark design-blend as completed
        stream_progress(id="design-blend", status="completed", wait_for=30)

        # --- PHASE 2: GENERATE EDITORIAL IMAGES ---
        log.info(f"Step 2: Generating {len(editorial_prompts)} editorial photographs...")
        
        # Prepare images for generation
        base_images_input = [
            {"url": img, "name": f"product_{i+1}"} 
            for i, img in enumerate(product_images)
        ]
        
        aspect_ratio_enum = _convert_aspect_ratio(aspect_ratio)
        output_format_enum = _convert_output_format(output_format)
        
        async def _generate_single_image(idx: int, prompt_data: Dict[str, Any]) -> Dict[str, Any]:
            """Generate one editorial image for the given prompt."""
            log.info(f"Generating editorial image {idx + 1}/{len(editorial_prompts)}...")
            
            text_prompt = _convert_editorial_prompt_to_text(prompt_data, product_images)
            return await generate_image(
                prompt=text_prompt,
                images=base_images_input,
                tag=f"Editorial Shot {idx+1}",
                aspect_ratio=aspect_ratio_enum,
                output_format=output_format_enum,
            )

        tasks = [
            _generate_single_image(i, prompt_data)
            for i, prompt_data in enumerate(editorial_prompts)
        ]

        task_results = await asyncio.gather(*tasks, return_exceptions=True)

        generated_images = []
        for i, result in enumerate(task_results):
            if isinstance(result, Exception):
                log.warning(f"Editorial image {i+1} generation failed: {result}")
                continue
            if result and "url" in result and "error" not in result:
                generated_images.append({
                    "type": "image",
                    "url": result["url"],
                    "tag": result.get("tag", f"Editorial Shot {i+1}"),
                    "source": result.get("source", "gemini")
                })
                log.info(f"Editorial image {i+1} generated successfully")
            else:
                log.warning(f"Editorial image {i+1} generation failed: {result}")
        
        execution_latency = time.perf_counter() - execution_start

        # Mark generate-assets as completed
        stream_progress(id="generate-assets", status="completed", wait_for=60)
        
        metadata = {
            "workflow": "multiproduct_tryon_editorial_v2",
            "product_analysis": product_analysis[:200] if product_analysis else "N/A",
            "reference_analysis": reference_analysis[:200] if reference_analysis else "N/A", 
            "custom_integration": "Applied" if custom_description else "N/A",
            "num_products": len(product_images),
            "num_references": len(reference_images),
            "images_generated": len(generated_images),
            "editorial_style": "Adaptive Editorial (GQ/Vogue Style)",
            "latency": round(execution_latency, 3)
        }
        log.info(f"Multi-Product Try-On workflow completed successfully: {metadata}")

        if len(generated_images) == 0:
            errors = [str(r) for r in task_results if isinstance(r, Exception)]
            error_msg = errors[0] if errors else "All image generations failed"
            return {
                "success": False,
                "outputAssets": [],
                "error": error_msg
            }

        return {
            "success": True,
            "outputAssets": generated_images,
            "metadata": metadata
        }

    except Exception as e:
        log.critical(f"Multi-Product Try-On workflow failed: {e}\n{traceback.format_exc()}")
        return {
            "success": False,
            "error": str(e),
            "outputAssets": []
        }


# ============================================================================
# ENTRY POINT
# ============================================================================

def multiproduct_tryon_execute(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point for the Multi-Product Try-On space.
    Extracts inputs from body and runs the workflow.
    
    Args:
        body: Dict with inputs:
            - product_images: List[str] - URLs of product images (required, at least 1)
            - reference_images: List[str] - URLs of reference/style images (optional)
            - custom_description: str - Custom creative direction (optional)
            - aspect_ratio: str - Aspect ratio (default: "3:4")
            - output_format: str - Output format (default: "png")
            - num_variations: int - Number of variations (default: 4, max: 15)
    
    Returns:
        Dict with success, outputAssets, and optional error/metadata
    """
    product_images = body.get("product_images", [])
    reference_images = body.get("reference_images", [])
    custom_description = body.get("custom_description", "")
    aspect_ratio = body.get("aspect_ratio", "3:4")
    output_format = body.get("output_format", "png")
    num_variations = body.get("num_variations", 4)
    
    log.info(f"multiproduct_tryon_execute called with: products={len(product_images)}, references={len(reference_images)}, custom='{custom_description[:50] if custom_description else 'none'}'")
    
    stream_progress(id="analyze-request", status="started", wait_for=15)
    
    return asyncio.run(_run_multiproduct_tryon_workflow(
        product_images=product_images,
        reference_images=reference_images,
        custom_description=custom_description,
        aspect_ratio=aspect_ratio,
        output_format=output_format,
        num_variations=num_variations
    ))

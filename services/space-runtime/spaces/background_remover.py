import requests
import asyncio
from io import BytesIO
import json
import traceback
from shared_libs.libs.logger import log
from shared_libs.libs.streaming import stream_progress, stream_image
from requests_toolbelt.multipart import decoder
from shared_libs.libs.storage_client import upload_to_s3, file_from_url
import config
from typing import Dict, Any
from requests.adapters import HTTPAdapter, Retry

# Try to import PIL, but make it optional
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    log.warning("PIL not available - skipping image dimension validation")

# Minimum resolution required by the API
MIN_WIDTH = 256
MIN_HEIGHT = 256

async def _remove_background(body: Dict[str, Any]): 


    input_image = body.get("input_image", None)
    if input_image is None:
        raise ValueError("input_image is required")

    image_bytes = await file_from_url(input_image)

    stream_progress(id="analyze-request", status="completed", wait_for=15)
    
    # Check image dimensions if PIL is available (optional validation)
    if PIL_AVAILABLE:
        try:
            image_bytes.seek(0)  # Reset to beginning
            img = Image.open(image_bytes)
            width, height = img.size
            image_bytes.seek(0)  # Reset again for API call
            
            if width < MIN_WIDTH or height < MIN_HEIGHT:
                raise ValueError(
                    f"Image resolution too small: {width} x {height} pixels. "
                    f"Minimum required resolution is {MIN_WIDTH} x {MIN_HEIGHT} pixels. "
                    f"Please use a larger image or upscale the image first."
                )
        except ValueError:
            raise  # Re-raise validation errors
        except Exception as e:
            log.warning(f"Could not validate image dimensions: {e}")
            image_bytes.seek(0)  # Reset for API call
    else:
        # PIL not available, skip dimension check
        image_bytes.seek(0)

    job = {
        "type": "inference.remove-background.v1",
    }

    files = {
        "job": ("job.json", BytesIO(json.dumps(job).encode("utf-8")), "application/json"),
        "input": ("input.jpg", image_bytes, "image/jpeg"),
    }

    prodia_token = config.PRODIA_API_KEY
    prodia_url = "https://inference.prodia.com/v2/job"

    try:
        session = requests.Session()
        retries = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"],
        )
        session.mount("https://", HTTPAdapter(max_retries=retries))
        session.headers.update({"Authorization": f"Bearer {prodia_token}"})

        res = session.post(prodia_url, headers={"Accept": "multipart/form-data"}, files=files)

        # Check if the API call was successful
        if res.status_code != 200:
            error_message = f"Background removal API returned status {res.status_code}"
            try:
                error_body = res.text
                if error_body:
                    error_message += f": {error_body}"
            except:
                pass
            raise Exception(error_message)

        multipart_data = decoder.MultipartDecoder.from_response(res)

        for part in multipart_data.parts:
            if part.headers.get(b'Content-Type') == b"application/json":
                continue
            elif part.headers.get(b'Content-Type', b'').startswith(b"image/"):
                # return first image as BytesIO - i.e, the first image is the one with removed background
                file_bytes = part.content
                filename = f"background_removed.png"
                url = await upload_to_s3(
                    filename=filename,
                    file_bytes=file_bytes,
                )
                
                stream_image(url, "Background removed")
                stream_progress(id="generate-output", status="completed")
                return {
                    "outputAssets": [
                        {
                            "type": "image",
                            "url": url,
                        }
                    ],
                    "success": True,
                }

        # If we reach here, no image was found in the response
        raise Exception("No image found in background removal API response. The API may have failed to process the image.")
    except Exception as e:
        log.critical(f"Error removing background: {e}\n{traceback.format_exc()}", usecase="background_remover")
        return {
            "success": False,
            "error": str(e),
            "outputAssets": []
        }


def execute_background_remover(body: Dict[str, Any]):
    return asyncio.run(_remove_background(body))
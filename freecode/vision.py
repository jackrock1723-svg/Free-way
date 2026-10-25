"""Image input. Any FC model can take images: a free vision model describes each image, and the
description is added to the task (the same approach Freebuff uses for its text-only models).
Order: NIM Nemotron 3.5 Super VL, then OpenRouter's free copy, then Gemma 4 31B (NIM, then OpenRouter)."""
import base64, binascii, re, struct, time
from .providers import ProviderError, EXTRA_PROVIDERS

VISION_CHAIN = [("nim", "nvidia/nemotron-3.5-super-vl-120b-a12b"), ("openrouter", "nvidia/nemotron-3.5-super-vl:free"),
                ("nim", "google/gemma-4-31b-it"), ("openrouter", "google/gemma-4-31b-it:free")]
MAX_IMAGES = 4
MAX_BYTES = 1_500_000
MAGIC = {"png": b"\x89PNG\r\n\x1a\n", "jpeg": b"\xff\xd8\xff", "gif": b"GIF8", "webp": b"RIFF"}
PROMPT = ("Describe this image for a coding agent that cannot see it. If it is a UI screenshot or mockup, list the layout, "
          "sections, components, visible text (verbatim), colours and spacing. If it shows an error or code, transcribe it exactly. "
          "Be concrete and complete, under 250 words. Plain text only.")
_DATA = re.compile(r"^data:image/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$")

def parse(data_url):
    """Validate a data URL and return (fmt, raw_bytes). Raises ValueError with a user-facing reason."""
    if not isinstance(data_url, str): raise ValueError("image must be a data URL")
    m = _DATA.match(data_url.strip())
    if not m: raise ValueError("images must be PNG, JPEG, GIF or WebP")
    fmt = "jpeg" if m.group(1) == "jpg" else m.group(1)
    try: raw = base64.b64decode(re.sub(r"\s", "", m.group(2)), validate=True)
    except (binascii.Error, ValueError): raise ValueError("image data is not valid base64")
    if len(raw) > MAX_BYTES: raise ValueError(f"image is too large ({len(raw)//1000} KB, max {MAX_BYTES//1000} KB)")
    if not raw.startswith(MAGIC[fmt]) or (fmt == "webp" and raw[8:12] != b"WEBP"): raise ValueError(f"file content is not a {fmt.upper()} image")
    return fmt, raw

def size(fmt, raw):
    try:
        if fmt == "png": return struct.unpack(">II", raw[16:24])
        if fmt == "gif": return struct.unpack("<HH", raw[6:10])
        if fmt == "jpeg":
            i = 2
            while i < len(raw) - 9:
                if raw[i] != 0xFF: i += 1; continue
                mk = raw[i + 1]; ln = struct.unpack(">H", raw[i + 2:i + 4])[0]
                if mk in (0xC0, 0xC1, 0xC2): h, w = struct.unpack(">HH", raw[i + 5:i + 9]); return w, h
                i += 2 + ln
    except struct.error: pass
    return None

def check(images):
    if images is None: return []
    if not isinstance(images, list): raise ValueError("images must be a list")
    if len(images) > MAX_IMAGES: raise ValueError(f"attach at most {MAX_IMAGES} images")
    return [parse(x) for x in images]

def describe(router, images, chain=None):
    """Returns (descriptions, routes). Each image goes down the chain until one model answers."""
    parsed = check(images); out = []; routes = []
    for n, (fmt, raw) in enumerate(parsed):
        if router.mock is not None:
            wh = size(fmt, raw); out.append(f"(demo vision) A {fmt.upper()} image" + (f" of {wh[0]}x{wh[1]} pixels" if wh else "") + ".")
            routes.append({"provider": "mock", "model": "mock"}); continue
        url = f"data:image/{fmt};base64," + base64.b64encode(raw).decode()
        msgs = [{"role": "user", "content": [{"type": "text", "text": PROMPT}, {"type": "image_url", "image_url": {"url": url}}]}]
        errors = []
        for prov, model in chain or VISION_CHAIN:
            p = router.providers.get(prov); key = router.keys.get(prov)
            if p is None or not key or router.cooldown.get(prov, 0) > time.time(): continue
            t0 = time.time()
            try:
                text = (p.complete(model, msgs, key=key, timeout=60, deadline=120, max_tokens=900) or "").strip()
            except ProviderError as e:
                if e.daily: router.cooldown[prov] = e.reset or time.time() + 3600
                errors.append(f"{prov}: {e}"); continue
            if len(text) < 10: errors.append(f"{prov}: empty description"); continue
            out.append(text[:3000]); routes.append({"provider": prov, "model": model, "ms": int((time.time() - t0) * 1000)}); break
        else:
            if not errors: raise ProviderError("Add a free NVIDIA NIM or OpenRouter key in Settings to use images.", 503, False)
            raise ProviderError(f"No free vision model could read image {n + 1}. Last error: {errors[-1]}", 503, False)
    return out, routes

def attach(prompt, descriptions):
    if not descriptions: return prompt
    return prompt + "\n\nAttached images (described by a vision model):\n" + "\n".join(f"Image {i + 1}: {d}" for i, d in enumerate(descriptions))

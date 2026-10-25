"""Model catalog. Free models are shown by their original upstream names, like Freebuff."""
from dataclasses import dataclass, field

@dataclass(frozen=True)
class Brand:
    id: str
    name: str
    tag: str
    skill: str          # plan | code | long | fast | auto
    tier: str           # free | premium
    upstream: tuple = field(default_factory=tuple)  # (provider, model_id) in failover order
    context: int = 0
    plan: str = "Free"
    strict_openrouter_free: bool = False

FREE = [
    Brand("auto", "Free way Auto", "Picks the best free model per step", "auto", "free", (), 0),
    Brand("forge", "GLM 5.3", "Deep reasoning · plans", "plan", "free",
          (("nim", "z-ai/glm-5.3"), ("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free")), 200_000),
    Brand("flux", "DeepSeek V4.1 Flash", "Fast coding · tools", "code", "free",
          (("nim", "deepseek-ai/deepseek-v4.1-flash"), ("openrouter", "poolside/laguna-s-2.1:free"), ("groq", "qwen/qwen3.8-27b")), 128_000),
    Brand("atlas", "Nemotron 3 Ultra", "Long context · big repos", "long", "free",
          (("nim", "nvidia/nemotron-3-ultra-550b-a55b"), ("openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free")), 1_000_000),
    Brand("craft", "Laguna S 2.1", "Code specialist", "code", "free",
          (("openrouter", "poolside/laguna-s-2.1:free"), ("nim", "deepseek-ai/deepseek-v4.1-flash"), ("mistral", "devstral-small-latest")), 262_144),
    Brand("spark", "MiniMax M3.1 Flash", "Speed · 1M context", "fast", "free",
          (("openrouter", "minimax/minimax-m3.1-flash:free"), ("openrouter", "nvidia/nemotron-3.5-lightning:free")), 1_000_000),
    Brand("lite", "Nemotron 3.5 Lightning", "Instant steps · routing", "fast", "free",
          (("openrouter", "nvidia/nemotron-3.5-lightning:free"), ("nim", "nvidia/nemotron-3.5-lightning-30b-a3b"), ("cloudflare", "@cf/qwen/qwen2.5-coder-32b-instruct"), ("groq", "qwen/qwen3.8-27b")), 1_000_000),
    Brand("laguna-xs", "Poolside Laguna XS 2.1", "Optional · OpenRouter free", "code", "free",
          (("openrouter", "poolside/laguna-xs-2.1:free"),), 262_144, strict_openrouter_free=True),
    Brand("north-mini-code", "Cohere North Mini Code", "Optional · OpenRouter free", "code", "free",
          (("openrouter", "cohere/north-mini-code:free"),), 256_000, strict_openrouter_free=True),
]
PREMIUM = [
    Brand("claude", "Claude family", "Premium · Anthropic", "code", "premium", (), 0, "Plus"),
    Brand("gpt", "GPT family", "Premium · OpenAI", "code", "premium", (), 0, "Plus"),
    Brand("gemini", "Gemini family", "Premium · Google", "long", "premium", (), 0, "Starter"),
]
ALL = {b.id: b for b in FREE + PREMIUM}
# Extra BYOK providers (groq, mistral, cloudflare) sit last in legacy brands: they are only tried when the user
# added that key. Their model ids follow each vendor's docs and are re-checked by scripts/check_models.py once a key exists.
# Order measured live on 2026-10-21 (plan latency, validity): Atlas ~50 s, Craft ~50 s, Lite ~75 s, Forge (GLM) > 6 min.
AUTO_ORDER = {"plan": ["atlas", "craft", "lite", "forge"], "code": ["craft", "atlas", "flux"],
              "long": ["atlas", "spark", "forge"], "fast": ["lite", "spark", "flux"]}
BANNED_FREE_FAMILIES = ("claude", "gpt", "openai", "gemini", "gpt-oss", "anthropic", "google/gemini")

def get(bid: str) -> Brand:
    if bid not in ALL:
        raise KeyError(bid)
    return ALL[bid]

def resolve(bid: str, skill: str = "code") -> list:
    """Return the ordered list of (brand, provider, model) candidates for a request."""
    b = get(bid)
    if b.tier != "free":
        raise PermissionError(f"{b.name} needs the {b.plan} plan")
    if b.strict_openrouter_free:
        return [(b.id, "openrouter", b.upstream[0][1])]
    chain = [get(x) for x in AUTO_ORDER.get(skill, AUTO_ORDER["code"])]
    # A chosen model is tried first; then Free way falls back through the Auto chain, so a model whose own
    # upstreams need a key the user has not added (MiniMax M3.1 Flash is OpenRouter-only) still answers via NIM.
    brands = chain if b.id == "auto" else [b] + [x for x in chain if x.id != b.id]
    out = []; seen = set()
    for br in brands:
        for prov, model in br.upstream:
            if (prov, model) in seen: continue      # Auto: try each upstream once
            seen.add((prov, model)); out.append((br.id, prov, model))
    return out

def public_list() -> list:
    return [{"id": b.id, "name": b.name, "tag": b.tag, "tier": b.tier, "plan": b.plan,
             "context": b.context, "free": b.tier == "free"} for b in FREE + PREMIUM]

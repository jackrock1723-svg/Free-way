"""Turn composer attachments into text an agent can read. Bounded: size caps, entry caps and no extraction to disk."""
import base64, io, re, shutil, subprocess, tempfile, zipfile, zlib

MAX_IN = 25 * 1024 * 1024; MAX_TEXT = 60_000; MAX_ENTRIES = 400; MAX_UNZIP = 4 * 1024 * 1024
TEXT_EXT = set("txt md markdown csv tsv json jsonl yaml yml toml ini cfg env log xml html htm css scss js mjs cjs ts tsx jsx py rb go rs java kt swift c h cpp hpp cs php sh bash zsh sql graphql vue svelte astro lua r dart ex exs erl hs ml scala gradle dockerfile makefile gitignore".split())
IMG = {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"}

class AttachError(ValueError): pass

def _ext(name): n = name.lower().rsplit("/", 1)[-1]; return n.rsplit(".", 1)[-1] if "." in n else n
def _decode(b):
    if b[:3] == b"\xef\xbb\xbf": b = b[3:]
    if b"\x00" in b[:4096]: return None
    try: return b.decode("utf-8")
    except UnicodeDecodeError: return b.decode("latin-1") if sum(c < 9 for c in b[:4096]) == 0 else None
def _cap(t): return (t[:MAX_TEXT], len(t) > MAX_TEXT)

def pdf_text(b):
    exe = shutil.which("pdftotext")
    if exe:
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(b); f.flush()
            try:
                r = subprocess.run([exe, "-layout", "-q", "-l", "60", f.name, "-"], capture_output=True, timeout=20)
                if r.returncode == 0 and r.stdout.strip(): return r.stdout.decode("utf-8", "replace")
            except subprocess.TimeoutExpired: pass
    out = []                                         # fallback: text operators in (possibly Flate-compressed) content streams
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", b, re.S):
        s = m.group(1)
        try: s = zlib.decompressobj().decompress(s, 2_000_000)
        except zlib.error: pass
        for t in re.findall(rb"\(((?:\\.|[^\\)])*)\)\s*T[jJ]|\[(.*?)\]\s*TJ", s, re.S):
            raw = t[0] or b"".join(re.findall(rb"\(((?:\\.|[^\\)])*)\)", t[1]))
            out.append(re.sub(rb"\\(.)", rb"\1", raw).decode("latin-1"))
        if sum(map(len, out)) > MAX_TEXT: break
    return " ".join(out)

def extract(name, data_b64, mime=""):
    name = str(name or "file")[:200]
    try: b = base64.b64decode(str(data_b64).split(",", 1)[-1], validate=False)
    except Exception: raise AttachError("could not read the file")
    if len(b) > MAX_IN: raise AttachError("This file is over 25 MB. Please attach a smaller file, or zip it.")
    ext = _ext(name); out = {"name": name, "size": len(b), "kind": "file", "text": "", "truncated": False}
    if ext in IMG or str(mime).startswith("image/"): out["kind"] = "image"; return out
    if ext == "pdf" or b[:5] == b"%PDF-":
        out["kind"] = "pdf"; out["text"], out["truncated"] = _cap(pdf_text(b).strip()); return out
    if ext in ("zip", "docx", "xlsx", "pptx", "odt") or b[:4] == b"PK\x03\x04":
        try: z = zipfile.ZipFile(io.BytesIO(b))
        except zipfile.BadZipFile: raise AttachError("that zip file is damaged")
        infos = [i for i in z.infolist() if not i.is_dir()]
        if ext == "docx" and "word/document.xml" in z.namelist():
            xml = z.read("word/document.xml")[:MAX_UNZIP].decode("utf-8", "replace")
            out["kind"] = "doc"; out["text"], out["truncated"] = _cap(re.sub(r"<[^>]+>", "", re.sub(r"</w:p>", "\n", xml)).strip()); return out
        out["kind"] = "zip"; out["entries"] = [{"path": i.filename, "size": i.file_size} for i in infos[:MAX_ENTRIES]]
        parts, budget = [], MAX_UNZIP
        for i in infos[:MAX_ENTRIES]:
            if _ext(i.filename) not in TEXT_EXT or i.file_size > 400_000 or i.file_size > budget or "__MACOSX" in i.filename: continue
            with z.open(i) as f: raw = f.read(min(i.file_size, budget) + 1)[:i.file_size]    # read at most the declared size: no zip bombs
            budget -= len(raw); t = _decode(raw)
            if t is not None: parts.append(f"--- {i.filename} ---\n{t}")
            if budget <= 0 or sum(map(len, parts)) > MAX_TEXT: break
        listing = "\n".join(f"{e['path']} ({e['size']} bytes)" for e in out["entries"])
        out["text"], out["truncated"] = _cap(f"Files in {name}:\n{listing}\n\n" + "\n\n".join(parts))
        out["truncated"] = out["truncated"] or len(infos) > MAX_ENTRIES; return out
    t = _decode(b)
    if t is None: out["kind"] = "binary"; return out
    out["kind"] = "code" if ext in TEXT_EXT - {"txt", "md", "markdown", "csv", "tsv", "log"} else "text"
    out["text"], out["truncated"] = _cap(t); return out

def as_prompt(files):
    """Compact block appended to a prompt."""
    blocks = []
    for f in files[:10]:
        head = f"[Attached {f.get('kind', 'file')}: {f.get('name')} ({f.get('size', 0)} bytes){', truncated' if f.get('truncated') else ''}]"
        blocks.append(head + ("\n" + f["text"] if f.get("text") else ""))
    return "\n\n".join(blocks)[:MAX_TEXT * 2]

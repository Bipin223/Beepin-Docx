#!/usr/bin/env python3
"""Beepin Docx local server (stdlib only).

Serves the static app and proxies AI requests so API keys never touch
the browser, logs, or error messages.

Endpoints:
  GET  /api/status            -> {gemini:bool, groq:bool, defaultProvider}
  POST /api/keys   {provider, key} -> {ok:true}            (memory only)
  DELETE /api/keys?provider=x -> {ok:true}
  POST /api/settings {defaultProvider} -> {ok:true}
  POST /api/models  {provider} -> {models:[{id}], cached:bool}
  POST /api/ai {provider, model?, messages, maxTokens?, vision?}
       -> {text, provider, model} | {error, code}
"""
import json
import time
import urllib.request
import urllib.error
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = __file__.rsplit("/", 1)[0].rsplit("\\", 1)[0] or "."

KEYS = {}            # provider -> key; memory only, never persisted
MODELS_CACHE = {}    # provider -> (timestamp, [ids]); TTL below
CACHE_TTL = 300
SETTINGS = {"defaultProvider": "gemini"}
LAST_GOOD = {}       # provider -> last model that actually succeeded
# models Google/Groq themselves point at when an older id 404s for a key
RECOMMENDED = {"gemini": "gemini-3.8-flash", "groq": "llama-3.3-70b-versatile"}
FALLBACK_MODELS = {"gemini": RECOMMENDED["gemini"], "groq": RECOMMENDED["groq"]}
VISION_MODELS = {"gemini": RECOMMENDED["gemini"], "groq": "meta-llama/llama-4-scout-17b-16e-instruct"}
UPSTREAM_TIMEOUT = 110
DISCOVERY_TIMEOUT = 20


def scrub(msg):
    for k in KEYS.values():
        if k and len(k) > 6 and k in msg:
            msg = msg.replace(k, "[api-key]")
    return msg


def jsend(handler, code, obj):
    body = json.dumps(obj).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def upost(url, payload, headers, timeout):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **headers}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode())


def uget(url, headers, timeout):
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode())


def upstream_error(provider, exc):
    if isinstance(exc, urllib.error.HTTPError):
        try:
            detail = json.loads(exc.read().decode())
            msg = (detail.get("error") or {}).get("message", "") or str(detail)[:200]
        except Exception:
            msg = exc.reason if isinstance(exc.reason, str) else "request failed"
        return {"error": scrub(str(msg))[:300], "code": f"UPSTREAM_{exc.code}", "status": exc.code}
    if isinstance(exc, TimeoutError) or "timed out" in str(exc).lower():
        return {"error": f"{provider} timed out", "code": "TIMEOUT", "status": None}
    return {"error": scrub(f"{provider} unreachable: {exc}")[:200], "code": "NETWORK", "status": None}


# ----- provider adapters: shared [{role, content, image?}] -> native -----
def gemini_payload(messages, max_tokens):
    system, contents = [], []
    for m in messages:
        role, text = m.get("role", "user"), m.get("content", "")
        if role == "system":
            system.append(text)
        else:
            parts = [{"text": text}] if text else []
            if m.get("image"):
                b64 = m["image"].split(",", 1)[1] if "," in m["image"] else m["image"]
                parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})
            contents.append({"role": "model" if role == "assistant" else "user", "parts": parts})
    body = {"contents": contents or [{"role": "user", "parts": [{"text": "hi"}]}],
            "generationConfig": {"maxOutputTokens": max_tokens or 4096, "temperature": 0.7}}
    if system:
        body["systemInstruction"] = {"parts": [{"text": "\n".join(system)}]}
    return body


def gemini_text(resp):
    cands = resp.get("candidates") or []
    if not cands:
        reason = ((resp.get("promptFeedback") or {}).get("blockReason")) or "empty response"
        return None, {"error": f"Gemini declined: {reason}", "code": "REFUSED"}
    cand = cands[0] or {}
    parts = ((cand.get("content") or {}).get("parts")) or []
    text = "".join(p.get("text", "") for p in parts
                   if isinstance(p, dict) and not p.get("thought") and isinstance(p.get("text", ""), str))
    if text:
        return text, None
    # 200 OK but no answer text — report why instead of a dead-end error
    det = f"finish={cand.get('finishReason') or '?'}"
    ratings = [r for r in (cand.get("safetyRatings") or []) if isinstance(r, dict)]
    if ratings:
        det += " safety=[" + ",".join(
            f"{str(r.get('category', '?')).split('/')[-1]}={r.get('probability', '?')}"
            for r in ratings) + "]"
    if any(isinstance(p, dict) and p.get("thought") for p in parts):
        det += "; answer empty because the model spent its tokens thinking (raise maxTokens)"
    return None, {"error": f"Gemini returned no text ({det})", "code": "BAD_RESPONSE"}


def groq_payload(messages, max_tokens):
    out = []
    for m in messages:
        role = m.get("role", "user")
        if role not in ("system", "user", "assistant"):
            role = "user"
        if m.get("image"):
            out.append({"role": role, "content": [
                {"type": "text", "text": m.get("content", "")},
                {"type": "image_url", "image_url": {"url": m["image"]}},
            ]})
        else:
            out.append({"role": role, "content": m.get("content", "")})
    return {"model": None, "messages": out, "temperature": 0.7, "max_tokens": max_tokens or 4096}


def groq_text(resp):
    try:
        choice = (resp.get("choices") or [{}])[0] or {}
        text = (choice.get("message") or {}).get("content") or ""
    except Exception:
        text = ""
    if not text:
        return None, {"error": "Groq returned no text", "code": "BAD_RESPONSE"}
    return text, None


def dead_model(err):
    """A model id this key can no longer call (retired / gated / renamed)."""
    if not isinstance(err, dict):
        return False
    msg = str(err.get("error", "")).lower()
    return err.get("code") == "UPSTREAM_404" or any(
        s in msg for s in ("no longer available", "not found", "not supported",
                           "has been retired", "is not found", "does not have a handler"))


def call_provider(provider, model, messages, max_tokens):
    key = KEYS.get(provider)
    if not key:
        return None, {"error": f"No {provider} key saved", "code": "NO_KEY", "status": None}
    model = (model or "").replace("models/", "").strip()
    try:
        if provider == "gemini":
            _, resp = upost(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                gemini_payload(messages, max_tokens), {}, UPSTREAM_TIMEOUT)
            return gemini_text(resp)
        if provider == "groq":
            payload = groq_payload(messages, max_tokens)
            payload["model"] = model
            _, resp = upost("https://api.groq.com/openai/v1/chat/completions", payload,
                            {"Authorization": "Bearer " + key}, UPSTREAM_TIMEOUT)
            return groq_text(resp)
    except Exception as exc:  # noqa: BLE001 - normalized below
        return None, upstream_error(provider, exc)
    return None, {"error": f"Unknown provider {provider}", "code": "BAD_REQUEST", "status": None}


def discover(provider):
    now = time.time()
    if provider in MODELS_CACHE and now - MODELS_CACHE[provider][0] < CACHE_TTL:
        return MODELS_CACHE[provider][1], True
    key = KEYS.get(provider)
    if not key:
        return None, {"error": f"No {provider} key saved", "code": "NO_KEY"}
    try:
        if provider == "gemini":
            _, resp = uget(f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
                           {}, DISCOVERY_TIMEOUT)
            ids = []
            for m in resp.get("models", []):
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    ids.append(m.get("name", "").replace("models/", ""))
        elif provider == "groq":
            _, resp = uget("https://api.groq.com/openai/v1/models",
                           {"Authorization": "Bearer " + key}, DISCOVERY_TIMEOUT)
            ids = [m.get("id") for m in resp.get("data", []) if m.get("id")]
        else:
            return None, {"error": f"Unknown provider {provider}", "code": "BAD_REQUEST"}
    except Exception as exc:  # noqa: BLE001
        return None, upstream_error(provider, exc)
    MODELS_CACHE[provider] = (now, ids)
    return ids, False


RETRYABLE = {"TIMEOUT", "NETWORK", "NO_KEY", "UPSTREAM_400", "UPSTREAM_401", "UPSTREAM_404",
             "UPSTREAM_429", "UPSTREAM_500", "UPSTREAM_502", "UPSTREAM_503", "UPSTREAM_504"}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet: method + path only
        print(f"{self.command} {self.path.split('?')[0]}")

    def _json(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
        except ValueError:
            n = 0
        try:
            return json.loads(self.rfile.read(n).decode() or "{}")
        except Exception:
            return {}

    def do_GET(self):
        if self.path == "/api/status":
            return jsend(self, 200, {"gemini": bool(KEYS.get("gemini")),
                                    "groq": bool(KEYS.get("groq")),
                                    "defaultProvider": SETTINGS["defaultProvider"]})
        return super().do_GET()

    def do_DELETE(self):
        from urllib.parse import urlparse, parse_qs
        if urlparse(self.path).path == "/api/keys":
            p = parse_qs(urlparse(self.path).query).get("provider", [""])[0]
            KEYS.pop(p, None)
            MODELS_CACHE.pop(p, None)
            LAST_GOOD.pop(p, None)
            return jsend(self, 200, {"ok": True})
        return jsend(self, 404, {"error": "not found", "code": "NOT_FOUND"})

    def do_POST(self):
        body = self._json()
        if self.path == "/api/keys":
            p, key = body.get("provider"), (body.get("key") or "").strip()
            if p not in ("gemini", "groq") or not key:
                return jsend(self, 400, {"error": "provider and key required", "code": "BAD_REQUEST"})
            KEYS[p] = key
            MODELS_CACHE.pop(p, None)
            return jsend(self, 200, {"ok": True})
        if self.path == "/api/settings":
            d = body.get("defaultProvider")
            if d in ("gemini", "groq"):
                SETTINGS["defaultProvider"] = d
                return jsend(self, 200, {"ok": True})
            return jsend(self, 400, {"error": "defaultProvider must be gemini|groq", "code": "BAD_REQUEST"})
        if self.path == "/api/models":
            p = body.get("provider")
            if p not in ("gemini", "groq"):
                return jsend(self, 400, {"error": "provider must be gemini|groq", "code": "BAD_REQUEST"})
            ids, extra = discover(p)
            if isinstance(extra, dict):  # error
                return jsend(self, 200, extra)
            return jsend(self, 200, {"models": [{"id": i} for i in ids], "cached": bool(extra)})
        if self.path == "/api/ai":
            return self._ai(body)
        return jsend(self, 404, {"error": "not found", "code": "NOT_FOUND"})

    def _ai(self, body):
        provider = body.get("provider", "auto")
        model = body.get("model")
        messages = body.get("messages") or []
        max_tokens = body.get("maxTokens")
        vision = bool(body.get("vision"))
        if not isinstance(messages, list) or not messages:
            return jsend(self, 400, {"error": "messages required", "code": "BAD_REQUEST"})
        if provider == "auto":
            first = SETTINGS["defaultProvider"]
            order = [first, "groq" if first == "gemini" else "gemini"]
        elif provider in ("gemini", "groq"):
            order = [provider]
        else:
            return jsend(self, 400, {"error": "provider must be auto|gemini|groq", "code": "BAD_REQUEST"})
        last_err, tried = {"error": "no provider configured", "code": "NO_KEY"}, 0
        for p in order:
            if tried >= 2:  # bounded: at most 2 attempts
                break
            m = model or LAST_GOOD.get(p) or (VISION_MODELS if vision else FALLBACK_MODELS)[p]
            asked = m
            text, err = call_provider(p, m, messages, max_tokens)
            if text is None and m != RECOMMENDED.get(p) and dead_model(err):
                # the chosen id is retired for this key → swap in the current model,
                # same provider, still counts as one attempt
                m = RECOMMENDED[p]
                text, err = call_provider(p, m, messages, max_tokens)
            if text is not None:
                LAST_GOOD[p] = m
                return jsend(self, 200, {"text": text, "provider": p, "model": m,
                                         "requested": asked, "switched": m != asked})
            last_err = err
            tried += 1
            if provider != "auto" or err.get("code") not in RETRYABLE:
                break  # manual mode, refusals and bad requests never fall through
        return jsend(self, 200, last_err)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 8000), partial(Handler, directory=BASE))
    print("Beepin Docx on http://localhost:8000  (keys: memory only, never logged)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass

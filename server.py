#!/usr/bin/env python3
"""Beepin Docx local server (stdlib only).

Serves the static app and proxies AI requests so API keys never touch
the browser, logs, or error messages.

Endpoints:
  GET  /api/status            -> {gemini:bool}
  POST /api/keys   {provider, key} -> {ok:true}            (memory only)
  DELETE /api/keys?provider=x -> {ok:true}
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
LAST_GOOD = {}       # last model that actually succeeded
# model Google itself points at when an older id 404s for a key
RECOMMENDED_MODEL = "gemini-3.8-flash"
FALLBACK_MODEL = RECOMMENDED_MODEL
VISION_MODEL = RECOMMENDED_MODEL
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


def dead_model(err):
    """A model id this key can no longer call (retired / gated / renamed)."""
    if not isinstance(err, dict):
        return False
    msg = str(err.get("error", "")).lower()
    return err.get("code") == "UPSTREAM_404" or any(
        s in msg for s in ("no longer available", "not found", "not supported",
                           "has been retired", "is not found", "does not have a handler"))


def call_provider(model, messages, max_tokens):
    key = KEYS.get("gemini")
    if not key:
        return None, {"error": "No gemini key saved", "code": "NO_KEY", "status": None}
    model = (model or "").replace("models/", "").strip()
    try:
        _, resp = upost(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
            gemini_payload(messages, max_tokens), {}, UPSTREAM_TIMEOUT)
        return gemini_text(resp)
    except Exception as exc:  # noqa: BLE001 - normalized below
        return None, upstream_error("gemini", exc)


def discover():
    now = time.time()
    if "gemini" in MODELS_CACHE and now - MODELS_CACHE["gemini"][0] < CACHE_TTL:
        return MODELS_CACHE["gemini"][1], True
    key = KEYS.get("gemini")
    if not key:
        return None, {"error": "No gemini key saved", "code": "NO_KEY"}
    try:
        _, resp = uget("https://generativelanguage.googleapis.com/v1beta/models?key=" + key,
                       {}, DISCOVERY_TIMEOUT)
        ids = []
        for m in resp.get("models", []):
            if "generateContent" in (m.get("supportedGenerationMethods", [])):
                ids.append(m.get("name", "").replace("models/", ""))
    except Exception as exc:  # noqa: BLE001
        return None, upstream_error("gemini", exc)
    MODELS_CACHE["gemini"] = (now, ids)
    return ids, False


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
            return jsend(self, 200, {"gemini": bool(KEYS.get("gemini"))})
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
            if p != "gemini" or not key:
                return jsend(self, 400, {"error": "provider and key required", "code": "BAD_REQUEST"})
            KEYS[p] = key
            MODELS_CACHE.pop(p, None)
            return jsend(self, 200, {"ok": True})
        if self.path == "/api/settings":
            return jsend(self, 200, {"ok": True})  # kept for compat; single provider now
        if self.path == "/api/models":
            p = body.get("provider", "gemini")
            if p not in ("gemini", "auto"):
                return jsend(self, 400, {"error": "provider must be gemini", "code": "BAD_REQUEST"})
            ids, extra = discover()
            if isinstance(extra, dict):  # error
                return jsend(self, 200, extra)
            return jsend(self, 200, {"models": [{"id": i} for i in ids], "cached": bool(extra)})
        if self.path == "/api/ai":
            return self._ai(body)
        return jsend(self, 404, {"error": "not found", "code": "NOT_FOUND"})

    def _ai(self, body):
        provider = body.get("provider", "gemini")
        if provider not in ("gemini", "auto"):
            return jsend(self, 400, {"error": "provider must be gemini", "code": "BAD_REQUEST"})
        model = body.get("model")
        messages = body.get("messages") or []
        max_tokens = body.get("maxTokens")
        vision = bool(body.get("vision"))
        if not isinstance(messages, list) or not messages:
            return jsend(self, 400, {"error": "messages required", "code": "BAD_REQUEST"})
        m = model or LAST_GOOD.get("gemini") or (VISION_MODEL if vision else FALLBACK_MODEL)
        asked = m
        text, err = call_provider(m, messages, max_tokens)
        if text is None and m != RECOMMENDED_MODEL and dead_model(err):
            # the chosen id is retired for this key → swap in the current model, one retry
            m = RECOMMENDED_MODEL
            text, err = call_provider(m, messages, max_tokens)
        if text is not None:
            LAST_GOOD["gemini"] = m
            return jsend(self, 200, {"text": text, "provider": "gemini", "model": m,
                                     "requested": asked, "switched": m != asked})
        return jsend(self, 200, err)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 8000), partial(Handler, directory=BASE))
    print("Beepin Docx on http://localhost:8000  (keys: memory only, never logged)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass

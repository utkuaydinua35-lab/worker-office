"""Run one office task with CrewAI and report the result to the Pixel Agents server.

The server (server/src/workers/workerService.ts) starts this script with the
crew's Python interpreter, writes one JSON payload to stdin and reads the
result from the last stdout line that starts with RESULT_MARKER.

Payload:
    {
      "task":      {"id": str, "description": str},
      "worker":    Worker + {"sessionId": str},
      "teammates": [Worker + {"sessionId": str}],   # only when delegation is allowed
      "llm":       {"provider": "anthropic" | "openai", "model": str},
      "filesDir":  str
    }

The API key arrives in the environment (ANTHROPIC_API_KEY / OPENAI_API_KEY).
Every worker's CrewAI agent is mapped onto its office character through
PixelAgentsListener(session_ids=...), so the character animates while it works.

Permissions are enforced here, by which tools an agent gets:
    readWeb  -> read_web_page   (fetch a URL, return its text)
    files    -> list_files / read_file / write_file, confined to filesDir
    delegate -> allow_delegation, with the other workers in the crew
"""

from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import sys
import traceback
from typing import Any
import urllib.request

from pydantic import BaseModel, Field


RESULT_MARKER = "@@WORKER_RESULT@@"
MAX_TOKENS = 16000
MAX_ITERATIONS = 25
WEB_PAGE_MAX_CHARS = 20000
WEB_TIMEOUT_S = 20
FILE_READ_MAX_CHARS = 50000
OPENAI_DEFAULT_MODEL = "gpt-4o"


def emit_result(**result: Any) -> None:
    print(RESULT_MARKER + json.dumps(result, ensure_ascii=False), flush=True)


# ── Tools ────────────────────────────────────────────────────────────────────


class _TextExtractor(HTMLParser):
    """Collect the visible text of an HTML page."""

    _SKIP = {"script", "style", "noscript", "svg", "head"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in self._SKIP:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip_depth and data.strip():
            self.parts.append(data.strip())


def build_tools(permissions: dict[str, Any], files_dir: Path) -> list[Any]:
    from crewai.tools import BaseTool

    tools: list[Any] = []

    if permissions.get("readWeb"):

        class UrlInput(BaseModel):
            url: str = Field(description="Okunacak sayfanın tam adresi (https://...)")

        class ReadWebPageTool(BaseTool):
            name: str = "read_web_page"
            description: str = (
                "Bir web sayfasını açar ve metnini döndürür. "
                "Opens a web page and returns its text."
            )
            args_schema: type[BaseModel] = UrlInput

            def _run(self, url: str) -> str:
                if not url.startswith(("http://", "https://")):
                    return "Hata: adres http:// veya https:// ile başlamalı."
                request = urllib.request.Request(
                    url, headers={"User-Agent": "Mozilla/5.0 (WorkerOffice)"}
                )
                try:
                    with urllib.request.urlopen(  # noqa: S310 - scheme checked above
                        request, timeout=WEB_TIMEOUT_S
                    ) as response:
                        charset = response.headers.get_content_charset() or "utf-8"
                        body = response.read().decode(charset, errors="replace")
                except Exception as exc:
                    return f"Hata: sayfa okunamadı ({exc})."
                parser = _TextExtractor()
                parser.feed(body)
                return "\n".join(parser.parts)[:WEB_PAGE_MAX_CHARS] or "(boş sayfa)"

        tools.append(ReadWebPageTool())

    if permissions.get("files"):
        root = files_dir.resolve()

        def resolve(name: str) -> Path | None:
            target = (root / name).resolve()
            return target if target == root or root in target.parents else None

        class NoInput(BaseModel):
            pass

        class PathInput(BaseModel):
            path: str = Field(description="Ofis klasörüne göre dosya yolu, ör. notlar/rapor.md")

        class WriteInput(BaseModel):
            path: str = Field(description="Ofis klasörüne göre dosya yolu, ör. notlar/rapor.md")
            content: str = Field(description="Dosyaya yazılacak metnin tamamı")

        class ListFilesTool(BaseTool):
            name: str = "list_files"
            description: str = "Ofisin ortak klasöründeki dosyaları listeler."
            args_schema: type[BaseModel] = NoInput

            def _run(self) -> str:
                files = [
                    str(p.relative_to(root)) for p in sorted(root.rglob("*")) if p.is_file()
                ]
                return "\n".join(files) or "(klasör boş)"

        class ReadFileTool(BaseTool):
            name: str = "read_file"
            description: str = "Ofisin ortak klasöründen bir metin dosyası okur."
            args_schema: type[BaseModel] = PathInput

            def _run(self, path: str) -> str:
                target = resolve(path)
                if target is None:
                    return "Hata: yalnızca ofis klasöründeki dosyalar okunabilir."
                if not target.is_file():
                    return "Hata: dosya bulunamadı."
                return target.read_text(encoding="utf-8", errors="replace")[
                    :FILE_READ_MAX_CHARS
                ]

        class WriteFileTool(BaseTool):
            name: str = "write_file"
            description: str = (
                "Ofisin ortak klasörüne bir metin dosyası yazar (varsa üzerine yazar)."
            )
            args_schema: type[BaseModel] = WriteInput

            def _run(self, path: str, content: str) -> str:
                target = resolve(path)
                if target is None or target == root:
                    return "Hata: yalnızca ofis klasörüne dosya yazılabilir."
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
                return f"Kaydedildi: {target.relative_to(root)}"

        tools.extend([ListFilesTool(), ReadFileTool(), WriteFileTool()])

    return tools


# ── Crew ─────────────────────────────────────────────────────────────────────


def build_llm(llm: dict[str, Any]) -> Any:
    from crewai import LLM

    provider = llm.get("provider", "anthropic")
    model = str(llm.get("model") or "").strip()
    if provider == "openai":
        return LLM(model=f"openai/{model or OPENAI_DEFAULT_MODEL}", max_tokens=MAX_TOKENS)
    return LLM(model=f"anthropic/{model}", max_tokens=MAX_TOKENS)


def build_agent(spec: dict[str, Any], llm: Any, files_dir: Path, delegate: bool) -> Any:
    from crewai import Agent

    name = spec.get("name") or "Worker"
    role = spec.get("role") or "Asistan"
    backstory = spec.get("backstory") or f"{name}, ofiste çalışan yardımsever bir {role}."
    return Agent(
        role=f"{role} ({name})",
        goal=spec.get("goal") or "Verilen görevi eksiksiz ve doğru şekilde tamamlamak.",
        backstory=(
            f"Adın {name}. {backstory}\n"
            "Kullanıcıya her zaman görevin yazıldığı dilde yanıt ver."
        ),
        llm=llm,
        tools=build_tools(spec.get("permissions") or {}, files_dir),
        allow_delegation=delegate,
        max_iter=MAX_ITERATIONS,
        verbose=False,
    )


def run(payload: dict[str, Any]) -> str:
    from crewai import Crew, Process, Task
    from crewai.events.listeners.pixel_agents import PixelAgentsListener

    files_dir = Path(payload["filesDir"])
    files_dir.mkdir(parents=True, exist_ok=True)
    llm = build_llm(payload.get("llm") or {})

    worker = payload["worker"]
    teammates = payload.get("teammates") or []
    lead = build_agent(worker, llm, files_dir, delegate=bool(teammates))
    others = [build_agent(t, llm, files_dir, delegate=False) for t in teammates]

    session_ids = {str(lead.id): worker["sessionId"]}
    for spec, agent in zip(teammates, others, strict=True):
        session_ids[str(agent.id)] = spec["sessionId"]
    PixelAgentsListener(session_ids=session_ids)

    task = Task(
        description=payload["task"]["description"],
        expected_output=(
            "Görevin eksiksiz sonucu: kullanıcının doğrudan okuyabileceği, "
            "görevin yazıldığı dilde, açık ve düzenli bir yanıt."
        ),
        agent=lead,
    )
    crew = Crew(
        agents=[lead, *others],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )
    result = crew.kickoff()
    return str(getattr(result, "raw", result))


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
    except ValueError as exc:
        emit_result(ok=False, error=f"Geçersiz görev verisi: {exc}")
        return 1
    try:
        output = run(payload)
    except Exception as exc:
        traceback.print_exc()
        emit_result(ok=False, error=f"{type(exc).__name__}: {exc}")
        return 1
    # Give the listener's delivery thread a moment to flush the last events.
    import time

    time.sleep(1)
    emit_result(ok=True, output=output)
    return 0


if __name__ == "__main__":
    sys.exit(main())

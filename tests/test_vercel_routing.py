"""Diagnostic tests for Vercel Python auto-detection rules.

These tests encode Vercel's documented detection rules as assertions so that
any change re-introducing the api/ → Python shadowing bug fails CI before
reaching production.

Rules reference: https://vercel.com/docs/functions/runtimes/python
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Vercel zero-config FastAPI entrypoint paths (Rule 2)
# https://vercel.com/docs/frameworks/backend/fastapi
ZERO_CONFIG_ENTRYPOINTS = [
    # "app.py" is intentionally used as our Vercel FastAPI entrypoint shim
    "index.py",
    "server.py",
    "src/app.py",
    "src/index.py",
    "src/server.py",
    "app/app.py",
    "app/index.py",
    "app/server.py",
]


class TestNoPythonApiDirectory:
    """Rule 1: Any .py file in api/ at project root → serverless function.

    The api/ → backend/ rename prevents Vercel from creating Python serverless
    functions that shadow Next.js API routes (e.g. /api/auth/[...nextauth]).
    https://vercel.com/docs/functions/runtimes/python
    """

    def test_no_api_directory_at_root(self):
        api_dir = PROJECT_ROOT / "api"
        assert not api_dir.exists(), (
            f"api/ directory exists at project root ({api_dir}). "
            "Vercel will auto-detect .py files as serverless functions, "
            "shadowing Next.js API routes. "
            "https://vercel.com/docs/functions/runtimes/python"
        )

    def test_no_py_files_would_be_in_api(self):
        api_dir = PROJECT_ROOT / "api"
        if not api_dir.exists():
            return  # Directory doesn't exist — pass
        py_files = list(api_dir.rglob("*.py"))
        # Exclude files starting with _ or . (Vercel ignores these, Rule 4)
        routable = [
            f for f in py_files
            if not f.name.startswith("_") and not f.name.startswith(".")
        ]
        assert not routable, (
            f"Found routable .py files in api/: {[str(f.relative_to(PROJECT_ROOT)) for f in routable]}. "
            "Each becomes a Vercel serverless function shadowing Next.js routes. "
            "https://vercel.com/docs/functions/runtimes/python"
        )


class TestNoZeroConfigEntrypoints:
    """Rule 2: Vercel scans specific paths for FastAPI() named `app`.

    https://vercel.com/docs/frameworks/backend/fastapi
    """

    @pytest.mark.parametrize("entrypoint", ZERO_CONFIG_ENTRYPOINTS)
    def test_no_fastapi_entrypoint(self, entrypoint: str):
        path = PROJECT_ROOT / entrypoint
        if not path.exists():
            return  # File doesn't exist — pass
        content = path.read_text()
        assert "FastAPI" not in content, (
            f"{entrypoint} contains 'FastAPI'. Vercel zero-config will treat this "
            "as a FastAPI entrypoint and create Python serverless functions. "
            "Move FastAPI code to backend/ instead. "
            "https://vercel.com/docs/frameworks/backend/fastapi"
        )

    def test_no_pyproject_scripts(self):
        """Rule 3: pyproject.toml [project.scripts] can point Vercel to a FastAPI entry."""
        pyproject = PROJECT_ROOT / "pyproject.toml"
        if not pyproject.exists():
            return  # No pyproject.toml — pass
        content = pyproject.read_text()
        assert "[project.scripts]" not in content, (
            "pyproject.toml contains [project.scripts]. Vercel uses this to "
            "locate FastAPI entrypoints. Remove it or ensure it doesn't point "
            "to a FastAPI app. "
            "https://vercel.com/docs/frameworks/backend/fastapi"
        )


class TestNextAuthRouteIntegrity:
    """The route that was being shadowed by Python auto-detection.

    app/api/auth/[...nextauth]/route.ts must exist and export GET/POST
    handlers. Next.js rewrites must not intercept /api/auth.
    """

    def test_nextauth_route_exists(self):
        route = PROJECT_ROOT / "app" / "api" / "auth" / "[...nextauth]" / "route.ts"
        assert route.exists(), (
            f"NextAuth route missing: {route.relative_to(PROJECT_ROOT)}. "
            "This is the OAuth handler — without it, /api/auth/* returns 404."
        )

    def test_nextauth_route_exports_handlers(self):
        route = PROJECT_ROOT / "app" / "api" / "auth" / "[...nextauth]" / "route.ts"
        if not route.exists():
            pytest.skip("NextAuth route file does not exist")
        content = route.read_text()
        for handler in ("GET", "POST"):
            assert f"as {handler}" in content or f"export {{ {handler}" in content or f"export {handler}" in content, (
                f"NextAuth route.ts does not export {handler}. "
                "NextAuth requires both GET and POST exports."
            )

    def test_rewrites_dont_shadow_auth(self):
        config = PROJECT_ROOT / "next.config.js"
        if not config.exists():
            return  # No config — no rewrites
        content = config.read_text()
        # Check that no rewrite source matches /api/auth
        assert "'/api/auth" not in content and '"/api/auth' not in content, (
            "next.config.js contains a rewrite for /api/auth. "
            "This would proxy OAuth routes to the FastAPI backend instead of "
            "letting Next.js handle them via app/api/auth/[...nextauth]/route.ts."
        )


class TestVercelConfig:
    """Rule 5: vercel.json `builds` with @vercel/python forces Python functions.

    https://vercel.com/docs/functions/runtimes/python
    """

    def _load_vercel_json(self) -> dict:
        path = PROJECT_ROOT / "vercel.json"
        if not path.exists():
            return {}
        return json.loads(path.read_text())

    def test_no_python_builds(self):
        config = self._load_vercel_json()
        builds = config.get("builds", [])
        python_builds = [b for b in builds if b.get("use") == "@vercel/python"]
        assert not python_builds, (
            f"vercel.json contains @vercel/python build entries: {python_builds}. "
            "This forces Vercel to create Python serverless functions in the "
            "Next.js project, shadowing API routes. "
            "https://vercel.com/docs/functions/runtimes/python"
        )

    def test_no_python_function_globs(self):
        config = self._load_vercel_json()
        functions = config.get("functions", {})
        py_patterns = [k for k in functions if k.endswith(".py") or "*.py" in k]
        assert not py_patterns, (
            f"vercel.json `functions` has Python patterns: {py_patterns}. "
            "This configures Python serverless functions in the Next.js project. "
            "https://vercel.com/docs/functions/runtimes/python"
        )


class TestNoStaleApiImports:
    """Regression guard: the api/ → backend/ rename must be complete.

    No Python file should still import from the old `api.` package.
    """

    def _check_imports(self, directory: str, glob_pattern: str = "**/*.py"):
        stale = []
        search_dir = PROJECT_ROOT / directory
        if not search_dir.exists():
            return stale
        for py_file in search_dir.rglob(glob_pattern):
            try:
                tree = ast.parse(py_file.read_text())
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("api."):
                    stale.append(f"{py_file.relative_to(PROJECT_ROOT)}:{node.lineno} → from {node.module}")
                elif isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name.startswith("api."):
                            stale.append(f"{py_file.relative_to(PROJECT_ROOT)}:{node.lineno} → import {alias.name}")
        return stale

    def test_no_api_imports_in_backend(self):
        stale = self._check_imports("backend")
        assert not stale, (
            f"Found stale 'from api.' imports in backend/: {stale}. "
            "Update these to 'from backend.' after the api/ → backend/ rename."
        )

    def test_no_api_imports_in_tests(self):
        stale = self._check_imports("tests")
        assert not stale, (
            f"Found stale 'from api.' imports in tests/: {stale}. "
            "Update these to 'from backend.' after the api/ → backend/ rename."
        )


class TestVercelEntrypoint:
    """app.py must exist as a thin re-export shim for Vercel FastAPI detection.

    Vercel zero-config scans app.py for a FastAPI `app` object.
    Our shim re-exports from backend.main — it must NOT define its own FastAPI().
    """

    def test_app_py_exists(self):
        app_py = PROJECT_ROOT / "app.py"
        assert app_py.exists(), (
            "app.py missing at project root. Vercel pramana-eval-api needs this "
            "as the FastAPI zero-config entrypoint. "
            "Expected: `from backend.main import app  # noqa: F401`"
        )

    def test_app_py_is_reexport_only(self):
        app_py = PROJECT_ROOT / "app.py"
        if not app_py.exists():
            pytest.skip("app.py does not exist")
        content = app_py.read_text()
        lines = [l for l in content.strip().splitlines() if l.strip() and not l.strip().startswith("#")]
        assert len(lines) <= 3, (
            f"app.py has {len(lines)} non-empty/non-comment lines (expected ≤3). "
            "It should be a thin re-export shim, not a full app definition."
        )
        assert "from backend.main import app" in content, (
            "app.py must contain `from backend.main import app`. "
            "It re-exports the FastAPI instance for Vercel zero-config detection."
        )
        assert "FastAPI(" not in content, (
            "app.py must NOT define its own FastAPI() instance. "
            "It should only re-export from backend.main."
        )

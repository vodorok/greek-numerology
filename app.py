# -*- coding: utf-8 -*-
import os
import sqlite3
from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file, flash
from werkzeug.middleware.proxy_fix import ProxyFix
from numerology import calculate
from urllib.parse import urlencode
import sys
import shutil

APP_NAME = "GreekNumerology"

def _resource_base():
    # When frozen by PyInstaller, data lives in _MEIPASS
    return getattr(sys, "_MEIPASS", os.path.dirname(__file__))

def resource_path(*parts):
    return os.path.join(_resource_base(), *parts)

def user_data_dir():
    # e.g., C:\Users\<you>\AppData\Local\GreekNumerology
    root = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local")
    path = os.path.join(root, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path

def get_db_path():
    # Allow override via env; otherwise use a writable copy under LocalAppData
    env = os.environ.get("NUM_DB_PATH")
    if env:
        return env

    path = os.path.join(user_data_dir(), "data.db")
    if not os.path.exists(path):
        # If a bundled seed DB exists, copy it on first run; else init from schema
        bundled = resource_path("data.db")  # ship as a seed file
        if os.path.exists(bundled):
            shutil.copyfile(bundled, path)
        else:
            # create empty db from schema
            import sqlite3
            conn = sqlite3.connect(path)
            with open(resource_path("schema.sql"), "r", encoding="utf-8") as f:
                conn.executescript(f.read())
            conn.commit()
            conn.close()
    return path


def get_db():
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    return conn

def init_app(app: Flask):
    @app.cli.command("init-db")
    def init_db():
        """Initialize DB from schema.sql"""
        db = get_db()
        with app.open_resource("schema.sql", mode="r") as f:
            db.executescript(f.read())
        db.commit()
        print("Initialized the database.")

    @app.cli.command("import-dataset")
    def import_dataset():
        """Import dataset.csv (tab-separated, first column word)."""
        path = os.path.join(os.path.dirname(__file__), "dataset.csv")
        if not os.path.exists(path):
            print("dataset.csv not found next to app.py")
            return
        db = get_db()
        cur = db.cursor()
        with open(path, "r", encoding="utf-8") as fh:
            for line in fh:
                word = line.strip().split("\t")[0].strip()
                if not word:
                    continue
                n1,n2,n3,n4,n5,n6 = calculate(word)
                # Upsert (SQLite 3.24+)
                cur.execute(
                    """INSERT INTO words (word, n1,n2,n3,n4,n5,n6)
                       VALUES (?, ?,?,?,?,?,?)
                       ON CONFLICT(word) DO UPDATE SET
                         n1=excluded.n1, n2=excluded.n2, n3=excluded.n3,
                         n4=excluded.n4, n5=excluded.n5, n6=excluded.n6""",
                    (word, n1,n2,n3,n4,n5,n6)
                )
        db.commit()
        print("Import complete.")


def parse_int(val, default=None, lo=0, hi=999_999):
    if val in (None, "", "any"):
        return default
    try:
        n = int(val)
    except (TypeError, ValueError):
        return default
    if n < lo: n = lo
    if n > hi: n = hi
    return n

def build_where_and_params(args):
    clauses, params = [], []

    q = (args.get("q") or "").strip()
    if q:
        clauses.append("word LIKE ?")
        params.append(f"%{q.upper()}%")

    for i in range(1, 7):
        exact = parse_int(args.get(f"n{i}"))
        lo = parse_int(args.get(f"n{i}_min"))
        hi = parse_int(args.get(f"n{i}_max"))

        if exact is not None:
            clauses.append(f"n{i} = ?")
            params.append(exact)
            continue

        # Strict: if both provided and hi <= lo, bump hi
        if lo is not None and hi is not None and hi <= lo:
            hi = min(lo + 1, 999_999)

        if lo is not None:
            clauses.append(f"n{i} >= ?")
            params.append(lo)
        if hi is not None:
            clauses.append(f"n{i} <= ?")
            params.append(hi)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def create_app():
    base = _resource_base()
    app = Flask(
        __name__,
        template_folder=os.path.join(base, "templates"),
        static_folder=os.path.join(base, "static"),
    )
    app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET", "dev-key")
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    init_app(app)

    @app.route("/", methods=["GET"])
    def index():
        # ---- pagination (safe parsing) ----
        try:
            page = int(request.args.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        if page < 1:
            page = 1

        try:
            per_page = int(request.args.get("per_page", 50))
        except (TypeError, ValueError):
            per_page = 50
        per_page = max(1, min(per_page, 500))

        # ---- filters ----
        where, params = build_where_and_params(request.args)

        # ---- count ----
        db = get_db()
        total = db.execute(f"SELECT COUNT(*) FROM words{where}", params).fetchone()[0]

        # ---- sorting ----
        sort = request.args.get("sort", "word")
        direction = request.args.get("dir", "asc").lower()
        if sort not in {"word","n1","n2","n3","n4","n5","n6"}:
            sort = "word"
        if direction not in {"asc","desc"}:
            direction = "asc"

        # ---- page data ----
        offset = (page - 1) * per_page
        rows = db.execute(
            f"""SELECT id, word, n1,n2,n3,n4,n5,n6
                FROM words{where}
                ORDER BY {sort} {direction}
                LIMIT ? OFFSET ?""",
            (*params, per_page, offset)
        ).fetchall()

        # ---- AJAX partial (live filter / sort / pager) ----
        if request.args.get("ajax") == "1":
            return render_template(
                "_table.html",
                rows=rows, total=total, page=page, per_page=per_page,
                sort=sort, direction=direction, args=request.args
            )

        # ---- full page ----
        return render_template(
            "index.html",
            rows=rows, total=total, page=page, per_page=per_page,
            sort=sort, direction=direction, args=request.args
        )


    @app.post("/add")
    def add():
        text = request.form.get("words", "").strip()
        if not text:
            flash("No words provided.", "warning")
            return redirect(url_for("index"))
        words = [w for w in [x.strip().upper() for x in text.replace(",", " ").split()] if w]
        if not words:
            flash("No valid words found.", "warning")
            return redirect(url_for("index"))
        db = get_db()
        cur = db.cursor()
        inserted = 0
        for w in words:
            n1,n2,n3,n4,n5,n6 = calculate(w)
            cur.execute(
                """INSERT INTO words (word, n1,n2,n3,n4,n5,n6)
                   VALUES (?,?,?,?,?,?,?)
                   ON CONFLICT(word) DO UPDATE SET
                     n1=excluded.n1, n2=excluded.n2, n3=excluded.n3,
                     n4=excluded.n4, n5=excluded.n5, n6=excluded.n6""",
                (w,n1,n2,n3,n4,n5,n6)
            )
            inserted += cur.rowcount != 0
        db.commit()
        flash(f"Added/updated {inserted} words.", "success")
        return redirect(url_for("index", **request.args))

    @app.post("/delete/<int:word_id>")
    def delete(word_id):
        db = get_db()
        db.execute("DELETE FROM words WHERE id = ?", (word_id,))
        db.commit()
        return jsonify({"ok": True})

    @app.get("/export.csv")
    def export_csv():
        import csv, io
        where, params = build_where_and_params(request.args)
        db = get_db()
        rows = db.execute(f"SELECT word,n1,n2,n3,n4,n5,n6 FROM words{where} ORDER BY word ASC", params).fetchall()
        si = io.StringIO()
        writer = csv.writer(si)
        writer.writerow(["word","n1","n2","n3","n4","n5","n6"])
        for r in rows:
            writer.writerow([r["word"], r["n1"], r["n2"], r["n3"], r["n4"], r["n5"], r["n6"]])
        mem = io.BytesIO(si.getvalue().encode("utf-8"))
        mem.seek(0)
        return send_file(mem, mimetype="text/csv", as_attachment=True, download_name="export.csv")

    return app

app = create_app()
# Helpers available inside Jinja
def current_url(**new_params):
    args = request.args.to_dict(flat=True)
    args.update(new_params)
    qs = urlencode(args)
    return f"{url_for('index')}{'?' + qs if qs else ''}"

def export_url():
    qs = request.query_string.decode() or ""
    return f"{url_for('export_csv')}{'?' + qs if qs else ''}"

def add_url():
    qs = request.query_string.decode() or ""
    return f"{url_for('add')}{'?' + qs if qs else ''}"

app.jinja_env.globals["current_url"] = current_url
app.jinja_env.globals["export_url"] = export_url
app.jinja_env.globals["add_url"] = add_url

if __name__ == "__main__":
    import threading, webbrowser, time
    def _open():
        time.sleep(0.8)
        webbrowser.open("http://127.0.0.1:5000/")
    threading.Thread(target=_open, daemon=True).start()
    try:
        from waitress import serve
        serve(app, host="127.0.0.1", port=5000)
    except Exception:
        app.run(host="127.0.0.1", port=5000, debug=False)
